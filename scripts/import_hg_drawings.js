#!/usr/bin/env node
/**
 * Bulk-import HG Drawings from the reviewed manifest into My Drawings.
 *
 * Usage:
 *   node scripts/import_hg_drawings.js
 *   BASE_URL=https://proconix.uk ADMIN_PIN=2026 node scripts/import_hg_drawings.js
 *   RESET=1 node scripts/import_hg_drawings.js
 *   DRY_RUN=1 node scripts/import_hg_drawings.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'scripts/hg_drawings_manifest.json');
const DRAWINGS_DIR = path.join(ROOT, 'HG Drawings');
const BASE_URL = String(process.env.BASE_URL || 'https://proconix.uk').replace(/\/$/, '');
const ADMIN_PIN = String(process.env.ADMIN_PIN || '2026');
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';
const RESET = process.env.RESET === '1' || process.env.RESET === 'true';

function loadItems() {
  const data = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  return (data.items || []).filter((it) => it.include);
}

function headers(extra) {
  return Object.assign({ 'X-MyDrawings-Pin': ADMIN_PIN }, extra || {});
}

async function apiJson(pathname, opts) {
  const res = await fetch(BASE_URL + pathname, Object.assign({ headers: headers() }, opts || {}));
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || !json || json.success === false) {
    throw new Error((json && json.message) || ('HTTP ' + res.status));
  }
  return json;
}

async function fetchCatalog(siteId) {
  const extra = siteId ? { 'X-MyDrawings-Site': String(siteId) } : {};
  const res = await fetch(BASE_URL + '/api/my-drawings/catalog', { headers: headers(extra) });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || !json || json.success === false) {
    throw new Error((json && json.message) || ('HTTP ' + res.status + ' catalog'));
  }
  return json;
}

async function deleteDrawing(id, siteId) {
  const extra = siteId ? { 'X-MyDrawings-Site': String(siteId) } : {};
  const res = await fetch(BASE_URL + '/api/my-drawings/drawings/' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: headers(extra),
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || !json || json.success === false) {
    throw new Error((json && json.message) || ('HTTP ' + res.status + ' delete ' + id));
  }
  return json;
}

async function resetCatalog() {
  const first = await fetchCatalog();
  const sites = Array.isArray(first.sites) && first.sites.length
    ? first.sites
    : [{ id: first.site && first.site.id }];
  let removed = 0;
  for (let s = 0; s < sites.length; s++) {
    const siteId = sites[s] && sites[s].id;
    let guard = 0;
    while (guard < 500) {
      guard += 1;
      const cat = await fetchCatalog(siteId);
      const drawings = Array.isArray(cat.drawings) ? cat.drawings : [];
      if (!drawings.length) break;
      for (let i = 0; i < drawings.length; i++) {
        const d = drawings[i];
        if (DRY_RUN) {
          console.log('DRY delete', d.number, d.id, 'site', siteId || '');
          removed += 1;
          continue;
        }
        await deleteDrawing(d.id, siteId);
        removed += 1;
        console.log('DEL', d.number, d.title || '');
      }
      if (DRY_RUN) break;
    }
  }
  console.log('Reset done. deleted=' + removed);
}

async function uploadOne(item, siteId) {
  const filePath = path.join(DRAWINGS_DIR, item.file);
  if (!fs.existsSync(filePath)) {
    throw new Error('Missing file: ' + item.file);
  }
  const buf = fs.readFileSync(filePath);
  const floors = Array.isArray(item.floors) ? item.floors.join(',') : '';
  const fd = new FormData();
  fd.append('number', String(item.number || '').slice(0, 40));
  fd.append('title', String(item.title || '').slice(0, 200));
  fd.append('category', String(item.category || 'General'));
  fd.append('revision', String(item.revision || 'A').slice(0, 12));
  fd.append('floors', floors);
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), item.file);

  const extra = siteId ? { 'X-MyDrawings-Site': String(siteId) } : {};
  const res = await fetch(BASE_URL + '/api/my-drawings/drawings', {
    method: 'POST',
    headers: headers(extra),
    body: fd,
  });
  let json = null;
  try {
    json = await res.json();
  } catch (e) {
    json = null;
  }
  if (!res.ok || !json || json.success === false) {
    throw new Error((json && json.message) || ('HTTP ' + res.status));
  }
  return json;
}

async function main() {
  const items = loadItems();
  console.log('Target:', BASE_URL);
  console.log('Drawings to import:', items.length, DRY_RUN ? '(dry run)' : '');
  if (RESET) {
    console.log('RESET=1 — deleting existing drawings first');
    await resetCatalog();
  }

  const catalog = await fetchCatalog();
  const siteId = catalog.site && catalog.site.id;
  console.log('Import site:', (catalog.site && catalog.site.name) || (catalog.project && catalog.project.name) || '', siteId || '');

  let ok = 0;
  let fail = 0;
  const errors = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = '[' + (i + 1) + '/' + items.length + '] ' + item.number + ' — ' + item.title;
    if (DRY_RUN) {
      console.log('DRY', label, '|', item.category, '|', (item.floors || []).join(','));
      ok += 1;
      continue;
    }
    try {
      await uploadOne(item, siteId);
      ok += 1;
      console.log('OK ', label);
    } catch (err) {
      fail += 1;
      const msg = err && err.message ? err.message : String(err);
      errors.push({ number: item.number, file: item.file, message: msg });
      console.error('ERR', label, '->', msg);
    }
  }

  console.log('Done. ok=' + ok + ' fail=' + fail);
  if (errors.length) {
    console.log(JSON.stringify(errors, null, 2));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
