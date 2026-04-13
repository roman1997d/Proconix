-- Link Site Snags drawings to Drawing Gallery versions (optional).
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_site_snag_drawings_drawing_gallery.sql
-- Requires: site_snag_drawings, drawing_version (create_drawing_gallery_tables.sql).

ALTER TABLE site_snag_drawings
  ADD COLUMN IF NOT EXISTS drawing_gallery_version_id INTEGER;

COMMENT ON COLUMN site_snag_drawings.drawing_gallery_version_id IS
  'Optional: active Drawing Gallery file for this sheet; image_data may be NULL when set.';

CREATE INDEX IF NOT EXISTS idx_site_snag_drawings_dg_version
  ON site_snag_drawings(drawing_gallery_version_id)
  WHERE drawing_gallery_version_id IS NOT NULL;
