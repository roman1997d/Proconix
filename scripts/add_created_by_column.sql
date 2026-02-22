-- Add missing column "created_by" to existing companies table.
-- Run in ProconixDB: psql -U postgres -d ProconixDB -f scripts/add_created_by_column.sql

ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);
