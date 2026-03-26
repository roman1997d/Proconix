-- Add structured timesheet jobs to work_logs
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_work_logs_add_timesheet_jobs.sql

ALTER TABLE work_logs
  ADD COLUMN IF NOT EXISTS timesheet_jobs JSONB DEFAULT '[]'::jsonb;

