-- Add latitude/longitude to projects (run once)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS latitude  NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(9,6);
