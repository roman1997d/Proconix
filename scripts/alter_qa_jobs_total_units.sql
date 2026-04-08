-- Total units quantity for QA jobs (e.g. doors, fixtures).
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_qa_jobs_total_units.sql

ALTER TABLE qa_jobs ADD COLUMN IF NOT EXISTS total_units VARCHAR(100);
