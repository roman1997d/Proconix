-- Migrate existing projects table to spec (add/rename columns).
-- Run after create_projects_table.sql if table already exists: psql -U postgres -d ProconixDB -f scripts/migrate_projects_to_spec.sql

-- Add FK to companies if not present (optional; uncomment if companies table exists and column has no FK)
-- ALTER TABLE projects DROP CONSTRAINT IF EXISTS fk_projects_company;
-- ALTER TABLE projects ADD CONSTRAINT fk_projects_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

-- Add new columns if missing
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_pass_key VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by_who VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_name VARCHAR(255);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS planned_end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS number_of_floors INT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deactivate_by_who VARCHAR(255);

-- Migrate name -> project_name if "name" exists and project_name is empty
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'name')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'project_name') THEN
    UPDATE projects SET project_name = name WHERE project_name IS NULL AND name IS NOT NULL;
  END IF;
END $$;

-- Drop old columns if you want strict spec (optional; removes "name", "end_date", "status")
-- ALTER TABLE projects DROP COLUMN IF EXISTS name;
-- ALTER TABLE projects DROP COLUMN IF EXISTS end_date;
-- ALTER TABLE projects DROP COLUMN IF EXISTS status;

-- Backfill project_pass_key for existing rows (10-char alphanumeric)
UPDATE projects
SET project_pass_key = (
  SELECT array_to_string(ARRAY(
    SELECT substr('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', (random() * 36 + 1)::int, 1)
    FROM generate_series(1, 10)
  ), '')
)
WHERE project_pass_key IS NULL;

-- Ensure active has a value
UPDATE projects SET active = TRUE WHERE active IS NULL;
