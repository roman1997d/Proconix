-- Allow operatives to hide their own work log entries from "My work entries"
-- (manager can still see them; this is NOT the manager archive flag).
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_work_logs_add_operative_archived.sql

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS operative_archived BOOLEAN DEFAULT FALSE;

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS operative_archived_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_work_logs_operative_archived ON work_logs(operative_archived);

