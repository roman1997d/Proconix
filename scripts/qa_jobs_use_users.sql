-- QA jobs: use company users (users table) for responsible and workers.
-- Run once: psql -U postgres -d ProconixDB -f scripts/qa_jobs_use_users.sql
-- Or paste this into pgAdmin / DBeaver / psql.

-- 1. Add responsible_user_id to qa_jobs (references users.id)
ALTER TABLE qa_jobs ADD COLUMN IF NOT EXISTS responsible_user_id INT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_qa_jobs_responsible_user_id ON qa_jobs(responsible_user_id);

-- 2. Table for job ↔ user (workers assigned to job) – user_id = users.id
CREATE TABLE IF NOT EXISTS qa_job_user_workers (
  job_id  INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_user_workers UNIQUE (job_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_job_user_workers_job ON qa_job_user_workers(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_user_workers_user ON qa_job_user_workers(user_id);
