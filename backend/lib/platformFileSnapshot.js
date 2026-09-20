/**
 * Directories included in platform backup/restore.
 * My Drawings PDFs live under backend/uploads/mydrawings/; originals may also
 * sit in HG Drawings/ at the project root (gitignored).
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

/** Folders packed into files.tar.gz when they exist. */
const FILE_SNAPSHOT_ROOTS = [
  'backend/uploads',
  'backend/output',
  'output',
  'HG Drawings',
];

/** Wiped then replaced on restore. HG Drawings is overlaid, not wiped, so older zips cannot delete originals. */
const RESTORE_WIPE_ROOTS = [
  'backend/uploads',
  'backend/output',
  'output',
];

function absFromRel(rel) {
  return path.join(PROJECT_ROOT, rel);
}

function existingSnapshotRels() {
  return FILE_SNAPSHOT_ROOTS.filter((rel) => {
    try {
      return fs.existsSync(absFromRel(rel));
    } catch (_) {
      return false;
    }
  });
}

function snapshotMeta(rels) {
  const list = Array.isArray(rels) ? rels : [];
  return {
    includes_site_cloud: list.some((rel) => rel === 'backend/uploads'),
    includes_my_drawings: list.some((rel) => rel === 'backend/uploads' || rel === 'HG Drawings'),
    includes_hg_drawings: list.some((rel) => rel === 'HG Drawings'),
    file_roots: list.slice(),
  };
}

module.exports = {
  PROJECT_ROOT,
  FILE_SNAPSHOT_ROOTS,
  RESTORE_WIPE_ROOTS,
  absFromRel,
  existingSnapshotRels,
  snapshotMeta,
};
