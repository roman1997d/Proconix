-- Scope Unit Progress workspace by project to avoid cross-project overwrites.
-- Existing rows become project_id = 0 (legacy/default scope).

ALTER TABLE unit_progress_state
  ADD COLUMN IF NOT EXISTS project_id INT;

UPDATE unit_progress_state
SET project_id = 0
WHERE project_id IS NULL;

ALTER TABLE unit_progress_state
  ALTER COLUMN project_id SET NOT NULL;

ALTER TABLE unit_progress_state
  ALTER COLUMN project_id SET DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'unit_progress_state'
      AND constraint_type = 'PRIMARY KEY'
      AND constraint_name = 'unit_progress_state_pkey'
  ) THEN
    ALTER TABLE unit_progress_state DROP CONSTRAINT unit_progress_state_pkey;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'unit_progress_state'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'unit_progress_state_company_project_unique'
  ) THEN
    ALTER TABLE unit_progress_state
      ADD CONSTRAINT unit_progress_state_company_project_unique UNIQUE (company_id, project_id);
  END IF;
END
$$;
