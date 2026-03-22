-- Alter work_hours to add geolocation for clock in / out.
-- Run (once) after create_work_hours_table.sql:
--   psql -U postgres -d ProconixDB -f scripts/alter_work_hours_add_geolocation.sql

ALTER TABLE work_hours
  ADD COLUMN IF NOT EXISTS clock_in_latitude  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_in_longitude NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_out_latitude  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS clock_out_longitude NUMERIC(9,6);

