-- Per-company cloud storage quota for Site Cloud (in MB).
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_companies_cloud_storage_limit.sql

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS cloud_storage_limit_mb INTEGER NOT NULL DEFAULT 500;

UPDATE companies
SET cloud_storage_limit_mb = 500
WHERE cloud_storage_limit_mb IS NULL OR cloud_storage_limit_mb < 1;

COMMENT ON COLUMN companies.cloud_storage_limit_mb IS 'Tenant Site Cloud storage quota in MB. Default 500 MB.';
