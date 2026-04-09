-- Trade categories per project (Plaster, Dryliner, etc.)
-- Used for operative work log work type and other project-scoped labels.
-- Run: psql -d ProconixDB -f scripts/create_project_trades.sql

CREATE TABLE IF NOT EXISTS project_trades (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label VARCHAR(200) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_trades_project_id ON project_trades(project_id);
