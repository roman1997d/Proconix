-- Planning tasks: optional crew assignment (Task & Planning module).
--
-- Order:
--   1. Run scripts/create_crews_tables.sql first (creates table `crews`).
--   2. Run this file.
--
-- Tip: stop on first error so a failed step does not hide the cause:
--   psql ... -v ON_ERROR_STOP=1 -f scripts/alter_planning_plan_tasks_crew.sql

-- Add columns without inline FK so a missing `crews` table does not block adding crew_id.
ALTER TABLE planning_plan_tasks
  ADD COLUMN IF NOT EXISTS crew_id INT;

ALTER TABLE planning_plan_tasks
  ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) NOT NULL DEFAULT 'names';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_plan_tasks_assignment_type_check'
  ) THEN
    ALTER TABLE planning_plan_tasks
      ADD CONSTRAINT planning_plan_tasks_assignment_type_check
      CHECK (assignment_type IN ('names', 'crew'));
  END IF;
END $$;

-- FK to crews (fails clearly if `crews` is missing — run create_crews_tables.sql first).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'planning_plan_tasks_crew_id_fkey'
  ) THEN
    ALTER TABLE planning_plan_tasks
      ADD CONSTRAINT planning_plan_tasks_crew_id_fkey
      FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_planning_plan_tasks_crew ON planning_plan_tasks(crew_id) WHERE crew_id IS NOT NULL;
