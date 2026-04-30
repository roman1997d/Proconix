-- Site Snags — relational storage (company-scoped). Replaces JSON blob site_snags_state.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_site_snags_tables.sql
--
-- Requires: companies, projects, users, manager tables.

DROP TABLE IF EXISTS site_snags_state;

CREATE TABLE IF NOT EXISTS site_snag_prefs (
  company_id INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  show_archived BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS site_snag_drawings (
  id VARCHAR(80) PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(500) NOT NULL DEFAULT '',
  block VARCHAR(200) NOT NULL DEFAULT '—',
  floor VARCHAR(200) NOT NULL DEFAULT '—',
  image_data TEXT,
  cloud_stored_name VARCHAR(700),
  pixels_to_mm DOUBLE PRECISION NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_snag_drawings_company ON site_snag_drawings(company_id);
CREATE INDEX IF NOT EXISTS idx_site_snag_drawings_project ON site_snag_drawings(project_id);

CREATE TABLE IF NOT EXISTS site_snags (
  id VARCHAR(80) PRIMARY KEY,
  drawing_id VARCHAR(80) NOT NULL REFERENCES site_snag_drawings(id) ON DELETE CASCADE,
  nx DOUBLE PRECISION NOT NULL,
  ny DOUBLE PRECISION NOT NULL,
  title VARCHAR(1000) NOT NULL DEFAULT '',
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'open',
  category VARCHAR(255),
  assignee_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assignee_manager_id INTEGER REFERENCES manager(id) ON DELETE SET NULL,
  assignee_display VARCHAR(500),
  target_date DATE,
  mock_planning_task_id VARCHAR(100),
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  photos_before JSONB NOT NULL DEFAULT '[]',
  photos_after JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_snags_one_assignee CHECK (
    assignee_user_id IS NULL OR assignee_manager_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_site_snags_drawing ON site_snags(drawing_id);

CREATE TABLE IF NOT EXISTS site_snag_measurements (
  id VARCHAR(80) PRIMARY KEY,
  drawing_id VARCHAR(80) NOT NULL REFERENCES site_snag_drawings(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_site_snag_measurements_drawing ON site_snag_measurements(drawing_id);

CREATE TABLE IF NOT EXISTS site_snag_highlights (
  id VARCHAR(80) PRIMARY KEY,
  drawing_id VARCHAR(80) NOT NULL REFERENCES site_snag_drawings(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_site_snag_highlights_drawing ON site_snag_highlights(drawing_id);

CREATE TABLE IF NOT EXISTS site_snag_custom_category (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (company_id, name)
);

CREATE TABLE IF NOT EXISTS site_snag_removed_preset (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  preset_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (company_id, preset_name)
);
