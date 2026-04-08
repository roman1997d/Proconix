-- QA jobs: optional links to company crews (Operatives → Crews).
-- Requires `crews` table (scripts/create_crews_tables.sql).

CREATE TABLE IF NOT EXISTS qa_job_crews (
  id         SERIAL PRIMARY KEY,
  job_id     INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  crew_id    INT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_crews_job_crew UNIQUE (job_id, crew_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_job_crews_job ON qa_job_crews(job_id);
