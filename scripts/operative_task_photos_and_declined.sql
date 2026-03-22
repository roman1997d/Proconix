-- Operative task confirmation photos + planning status "declined" (refuz).
-- Run once: psql -U postgres -d ProconixDB -f scripts/operative_task_photos_and_declined.sql

-- Allow operatives to mark a planning task as declined (refuz)
ALTER TABLE planning_plan_tasks DROP CONSTRAINT IF EXISTS planning_plan_tasks_status_check;
ALTER TABLE planning_plan_tasks ADD CONSTRAINT planning_plan_tasks_status_check
  CHECK (status IN ('not_started', 'in_progress', 'paused', 'completed', 'declined'));

CREATE TABLE IF NOT EXISTS operative_task_photos (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL,
  task_source     VARCHAR(20) NOT NULL CHECK (task_source IN ('legacy', 'planning')),
  task_id         INT NOT NULL,
  file_url        VARCHAR(500) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operative_task_photos_lookup
  ON operative_task_photos (user_id, task_source, task_id);

COMMENT ON TABLE operative_task_photos IS 'Confirmation photos uploaded by operatives for assigned tasks (max 10 per user/task enforced in API).';
