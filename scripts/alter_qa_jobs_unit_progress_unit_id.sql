-- Link QA jobs to Unit Progress Tracking units when created from tower/floor/unit picker.
-- Run once: psql ... -f scripts/alter_qa_jobs_unit_progress_unit_id.sql

ALTER TABLE qa_jobs ADD COLUMN IF NOT EXISTS unit_progress_unit_id VARCHAR(128);
CREATE INDEX IF NOT EXISTS idx_qa_jobs_unit_progress_unit_id ON qa_jobs (unit_progress_unit_id);

COMMENT ON COLUMN qa_jobs.unit_progress_unit_id IS 'Unit Progress workspace unit id when job was anchored to that unit at creation';
