/**
 * Per-site floors + extra locations for My Drawings.
 * Floor 1..N are generated from floor_count; extras are named places (bin store, utility).
 */

const MAX_FLOOR_COUNT = 80;
const DEFAULT_FLOOR_COUNT = 5;

function slugLocation(label) {
  const s = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || null;
}

function parseFloorCount(raw, fallback) {
  if (raw == null || raw === '') {
    return fallback !== undefined ? fallback : DEFAULT_FLOOR_COUNT;
  }
  const n = parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1) return null;
  return Math.min(MAX_FLOOR_COUNT, n);
}

function parseExtraLocations(raw) {
  let arr = raw;
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      arr = JSON.parse(s);
    } catch (e) {
      arr = s.split(/[,|;]+/);
    }
  }
  if (!Array.isArray(arr)) arr = [arr];
  const out = [];
  const seen = new Set();
  for (let i = 0; i < arr.length; i++) {
    const label = String(arr[i] == null ? '' : arr[i]).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label) continue;
    const id = slugLocation(label);
    if (!id) continue;
    if (id === 'ground' || /^\d+$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(label);
    if (out.length >= 40) break;
  }
  return out;
}

function buildLocations(floorCount, extraLabels) {
  const n = parseFloorCount(floorCount, DEFAULT_FLOOR_COUNT) || DEFAULT_FLOOR_COUNT;
  const list = [{ id: 'ground', label: 'Ground Floor', kind: 'floor' }];
  for (let i = 1; i <= n; i++) {
    list.push({ id: String(i), label: 'Floor ' + i, kind: 'floor' });
  }
  parseExtraLocations(extraLabels).forEach((label) => {
    list.push({ id: slugLocation(label), label, kind: 'extra' });
  });
  return list;
}

function normalizeLocationId(raw) {
  const v = String(raw == null ? '' : raw).trim();
  if (!v) return null;
  const lower = v.toLowerCase().replace(/\s+/g, ' ');
  if (
    lower === '0' ||
    lower === 'gf' ||
    lower === 'g' ||
    lower === 'ground' ||
    lower === 'ground floor' ||
    lower === 'groundfloor'
  ) {
    return 'ground';
  }
  const m = lower.match(/^(?:floor|level|l)\s*[-.]?\s*(\d+)$/) || lower.match(/^(\d+)$/);
  if (m) {
    const num = parseInt(m[1], 10);
    if (num === 0) return 'ground';
    if (Number.isInteger(num) && num >= 1 && num <= MAX_FLOOR_COUNT) return String(num);
  }
  return slugLocation(lower);
}

function parseLocationIds(raw, allowedIds) {
  if (raw == null || raw === '') return null;
  let arr = raw;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return null;
    try {
      arr = JSON.parse(s);
    } catch (e) {
      arr = s.split(/[,|;]+/);
    }
  }
  if (!Array.isArray(arr)) arr = [arr];
  const allowed = allowedIds && allowedIds.length ? new Set(allowedIds.map(String)) : null;
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const id = normalizeLocationId(arr[i]);
    if (!id) continue;
    if (allowed && !allowed.has(id)) continue;
    if (out.indexOf(id) === -1) out.push(id);
  }
  return out.length ? out : null;
}

function locationsFromProject(project) {
  if (!project) return buildLocations(DEFAULT_FLOOR_COUNT, []);
  if (Array.isArray(project.locations) && project.locations.length) return project.locations;
  return buildLocations(
    project.floorCount != null ? project.floorCount : project.floor_count,
    project.extraLocations || project.extra_locations || []
  );
}

function allowedLocationIds(project) {
  return locationsFromProject(project).map((l) => l.id);
}

function labelForLocationId(id, locations) {
  const list = locations || [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i].label;
  }
  if (id === 'ground') return 'Ground Floor';
  if (/^\d+$/.test(String(id))) return 'Floor ' + id;
  return String(id || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function occupiedLocations(drawings, siteLocations) {
  const locList = siteLocations || [];
  const seen = new Set();
  const out = [];
  (drawings || []).forEach((d) => {
    (d.floors || []).forEach((id) => {
      const nid = normalizeLocationId(id) || String(id || '');
      if (!nid || seen.has(nid)) return;
      seen.add(nid);
      out.push({
        id: nid,
        label: labelForLocationId(nid, locList),
      });
    });
  });
  out.sort((a, b) => {
    if (a.id === 'ground') return -1;
    if (b.id === 'ground') return 1;
    const an = /^\d+$/.test(a.id) ? parseInt(a.id, 10) : null;
    const bn = /^\d+$/.test(b.id) ? parseInt(b.id, 10) : null;
    if (an != null && bn != null) return an - bn;
    if (an != null) return -1;
    if (bn != null) return 1;
    return String(a.label).localeCompare(String(b.label));
  });
  return out;
}

function siteLocationFields(row) {
  const floorCount = parseFloorCount(
    row && (row.floor_count != null ? row.floor_count : row.floorCount),
    DEFAULT_FLOOR_COUNT
  );
  const extraLocations = parseExtraLocations(
    row && (row.extra_locations || row.extraLocations)
  );
  return {
    floorCount: floorCount || DEFAULT_FLOOR_COUNT,
    extraLocations,
    locations: buildLocations(floorCount || DEFAULT_FLOOR_COUNT, extraLocations),
  };
}

module.exports = {
  MAX_FLOOR_COUNT,
  DEFAULT_FLOOR_COUNT,
  slugLocation,
  parseFloorCount,
  parseExtraLocations,
  buildLocations,
  normalizeLocationId,
  parseLocationIds,
  locationsFromProject,
  allowedLocationIds,
  labelForLocationId,
  occupiedLocations,
  siteLocationFields,
};
