-- Links QA jobs to Materials (per template step key "templateId:stepId").
-- Run after: create_qa_tables.sql, create_material_tables.sql
-- Example: psql -U postgres -d ProconixDB -f scripts/alter_qa_job_step_materials.sql

CREATE TABLE IF NOT EXISTS qa_job_step_materials (
  id           SERIAL PRIMARY KEY,
  job_id       INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  step_key     VARCHAR(120) NOT NULL,
  material_id  INT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_qa_job_step_material UNIQUE (job_id, step_key, material_id)
);

CREATE INDEX IF NOT EXISTS idx_qa_job_step_materials_job ON qa_job_step_materials(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_step_materials_material ON qa_job_step_materials(material_id);
