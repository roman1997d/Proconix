-- QA job checklist evidence per template step (supervisor photos + comments).
-- Run once: psql -U postgres -d ProconixDB -f scripts/alter_qa_job_step_evidence.sql

CREATE TABLE IF NOT EXISTS qa_job_step_evidence (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  template_id INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  step_external_id TEXT NOT NULL,
  comment TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT uq_qa_job_step_evidence UNIQUE (job_id, template_id, step_external_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_job_step_evidence_job ON qa_job_step_evidence(job_id);

CREATE TABLE IF NOT EXISTS qa_job_step_photos (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  template_id INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  step_external_id TEXT NOT NULL,
  file_url TEXT NOT NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_job_step_photos_job ON qa_job_step_photos(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_step_photos_step ON qa_job_step_photos(job_id, template_id, step_external_id);
