-- Shared work entries: multiple operatives on one work_log row.
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_work_logs_collaborators.sql

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS collaborator_user_ids INTEGER[] NOT NULL DEFAULT '{}';

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS collaborators_display JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_work_logs_collaborator_ids ON work_logs USING GIN (collaborator_user_ids);

COMMENT ON COLUMN work_logs.collaborator_user_ids IS 'Other operative user ids credited on this entry (submitter is submitted_by_user_id).';
COMMENT ON COLUMN work_logs.collaborators_display IS 'Snapshot [{userId, name}] for UI; derived from users at submit time.';
