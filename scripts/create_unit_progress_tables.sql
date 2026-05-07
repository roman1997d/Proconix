-- Unit Progress Tracking workspace table
-- Run: psql -U postgres -d ProconixDB -f scripts/create_unit_progress_tables.sql

CREATE TABLE IF NOT EXISTS unit_progress_state (
  company_id INT NOT NULL,
  project_id INT NOT NULL DEFAULT 0,
  workspace JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by_kind VARCHAR(20),
  updated_by_id INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unit_progress_state_company_project_unique UNIQUE (company_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_unit_progress_state_updated_at
  ON unit_progress_state(updated_at DESC);
