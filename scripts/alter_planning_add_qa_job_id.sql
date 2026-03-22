-- Add QA linkage to Planning tasks
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_planning_add_qa_job_id.sql

ALTER TABLE planning_plan_tasks
  ADD COLUMN IF NOT EXISTS qa_job_id INT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_planning_plan_tasks_qa_job_id
  ON planning_plan_tasks(qa_job_id);

