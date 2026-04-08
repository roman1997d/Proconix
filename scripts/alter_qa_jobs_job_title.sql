-- Optional job display title for QA jobs (manager-entered).
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_qa_jobs_job_title.sql

ALTER TABLE qa_jobs ADD COLUMN IF NOT EXISTS job_title VARCHAR(500);
