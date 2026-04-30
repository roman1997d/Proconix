ALTER TABLE site_snag_drawings
  ADD COLUMN IF NOT EXISTS cloud_stored_name VARCHAR(700);

COMMENT ON COLUMN site_snag_drawings.cloud_stored_name IS
  'Stored file name from Site Cloud index, used to auto-remove drawings when cloud file is deleted.';

CREATE INDEX IF NOT EXISTS idx_site_snag_drawings_cloud_stored_name
  ON site_snag_drawings(cloud_stored_name)
  WHERE cloud_stored_name IS NOT NULL;
