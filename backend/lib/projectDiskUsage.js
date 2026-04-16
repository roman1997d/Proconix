/**
 * Approximate disk usage of the Proconix project tree (all files under repo root).
 * Cached to avoid blocking the event loop on every admin refresh.
 */

const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 90 * 1000;

let cache = {
  at: 0,
  payload: null,
};

/**
 * Repo root: folder that contains package.json (and usually backend/, frontend/).
 * Tries several paths so it still works if cwd differs (PM2, Docker, systemd).
 */
function getProjectRoot() {
  const candidates = [
    path.resolve(__dirname, '../..'),
    process.cwd(),
    path.resolve(process.cwd(), '..'),
  ];
  const seen = new Set();
  for (let i = 0; i < candidates.length; i++) {
    const c = path.resolve(candidates[i]);
    if (seen.has(c)) continue;
    seen.add(c);
    try {
      if (fs.existsSync(path.join(c, 'package.json'))) return c;
    } catch (_) {
      /* ignore */
    }
  }
  return path.resolve(__dirname, '../..');
}

function bytesToMb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.ico',
  '.tif',
  '.tiff',
  '.avif',
  '.heic',
]);

const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.rtf',
  '.csv',
  '.md',
  '.json',
  '.xml',
]);

function getBucketByName(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'images';
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'documents';
  return 'others';
}

function walkDirStats(absDir) {
  const categories = {
    images_bytes: 0,
    documents_bytes: 0,
    others_bytes: 0,
  };
  let total = 0;
  const stack = [absDir];
  while (stack.length) {
    const p = stack.pop();
    let names;
    try {
      names = fs.readdirSync(p);
    } catch {
      continue;
    }
    for (let i = 0; i < names.length; i++) {
      const full = path.join(p, names[i]);
      let st;
      try {
        st = fs.lstatSync(full);
      } catch {
        continue;
      }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile()) {
        total += st.size;
        const bucket = getBucketByName(names[i]);
        categories[bucket + '_bytes'] += st.size;
      }
    }
  }
  return { total, categories };
}

/**
 * @returns {{
 *   root_path: string,
 *   scanned_at: string,
 *   total_bytes: number,
 *   total_mb: number,
 *   entries: Array<{ name: string, bytes: number, mb: number }>,
 *   cache_ttl_seconds: number
 * }}
 */
function computeProjectDiskUsage() {
  const root = getProjectRoot();
  let list;
  try {
    list = fs.readdirSync(root, { withFileTypes: true });
  } catch (e) {
    return {
      root_path: root,
      scanned_at: new Date().toISOString(),
      total_bytes: 0,
      total_mb: 0,
      entries: [],
      error: e.message || String(e),
      cache_ttl_seconds: Math.round(CACHE_TTL_MS / 1000),
    };
  }

  const entries = [];
  let total = 0;
  const categories = {
    images_bytes: 0,
    documents_bytes: 0,
    others_bytes: 0,
  };

  for (let i = 0; i < list.length; i++) {
    const d = list[i];
    const name = d.name;
    const full = path.join(root, name);
    let bytes = 0;
    try {
      if (d.isSymbolicLink()) continue;
      if (d.isDirectory()) {
        const stats = walkDirStats(full);
        bytes = stats.total;
        categories.images_bytes += stats.categories.images_bytes;
        categories.documents_bytes += stats.categories.documents_bytes;
        categories.others_bytes += stats.categories.others_bytes;
      } else if (d.isFile()) {
        const st = fs.statSync(full);
        bytes = st.size;
        const bucket = getBucketByName(name);
        categories[bucket + '_bytes'] += st.size;
      }
    } catch {
      bytes = 0;
    }
    total += bytes;
    entries.push({
      name,
      bytes,
      mb: bytesToMb(bytes),
    });
  }

  entries.sort(function (a, b) {
    return b.bytes - a.bytes;
  });

  return {
    root_path: root,
    scanned_at: new Date().toISOString(),
    total_bytes: total,
    total_mb: bytesToMb(total),
    categories: {
      images_bytes: categories.images_bytes,
      images_mb: bytesToMb(categories.images_bytes),
      documents_bytes: categories.documents_bytes,
      documents_mb: bytesToMb(categories.documents_bytes),
      others_bytes: categories.others_bytes,
      others_mb: bytesToMb(categories.others_bytes),
    },
    entries,
    cache_ttl_seconds: Math.round(CACHE_TTL_MS / 1000),
  };
}

function getProjectDiskUsageCached() {
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_TTL_MS) {
    return Object.assign({}, cache.payload, { from_cache: true });
  }
  const payload = computeProjectDiskUsage();
  cache = { at: now, payload };
  return Object.assign({}, payload, { from_cache: false });
}

module.exports = {
  getProjectRoot,
  getProjectDiskUsageCached,
};
