-- Optional crew assignment for planning tasks (Task & Planning module)
ALTER TABLE planning_plan_tasks
  ADD COLUMN IF NOT EXISTS crew_id INT REFERENCES crews(id) ON DELETE SET NULL;
ALTER TABLE planning_plan_tasks
  ADD COLUMN IF NOT EXISTS assignment_type VARCHAR(20) NOT NULL DEFAULT 'names'
    CHECK (assignment_type IN ('names', 'crew'));

CREATE INDEX IF NOT EXISTS idx_planning_plan_tasks_crew ON planning_plan_tasks(crew_id) WHERE crew_id IS NOT NULL;
