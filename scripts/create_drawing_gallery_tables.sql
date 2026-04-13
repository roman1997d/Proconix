-- Drawing Gallery: plans/drawings per project with versioning (no hard delete).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_drawing_gallery_tables.sql

CREATE TABLE IF NOT EXISTS drawing_series (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  project_id INT NOT NULL,
  title VARCHAR(500) NOT NULL,
  title_key VARCHAR(520) NOT NULL,
  description TEXT,
  floor_label VARCHAR(200),
  zone_label VARCHAR(200),
  discipline VARCHAR(200),
  keywords TEXT,
  created_by_manager_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_drawing_series_project_title UNIQUE (project_id, title_key)
);

CREATE INDEX IF NOT EXISTS idx_drawing_series_company ON drawing_series(company_id);
CREATE INDEX IF NOT EXISTS idx_drawing_series_project ON drawing_series(project_id);

CREATE TABLE IF NOT EXISTS drawing_version (
  id SERIAL PRIMARY KEY,
  series_id INT NOT NULL REFERENCES drawing_series(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'archived')),
  stored_filename VARCHAR(500) NOT NULL,
  relative_path VARCHAR(1200) NOT NULL,
  mime_type VARCHAR(200) NOT NULL,
  file_size_bytes BIGINT,
  description TEXT,
  uploaded_by_manager_id INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_drawing_version_series_ver UNIQUE (series_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_drawing_version_series_status ON drawing_version(series_id, status);

CREATE TABLE IF NOT EXISTS drawing_comment (
  id SERIAL PRIMARY KEY,
  version_id INT NOT NULL REFERENCES drawing_version(id) ON DELETE CASCADE,
  author_kind VARCHAR(20) NOT NULL CHECK (author_kind IN ('manager', 'operative')),
  author_id INT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drawing_comment_version ON drawing_comment(version_id);

CREATE TABLE IF NOT EXISTS drawing_gallery_notification (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  project_id INT NOT NULL,
  drawing_version_id INT NOT NULL REFERENCES drawing_version(id) ON DELETE CASCADE,
  recipient_kind VARCHAR(20) NOT NULL CHECK (recipient_kind IN ('manager', 'operative')),
  recipient_id INT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dgn_recipient ON drawing_gallery_notification(company_id, recipient_kind, recipient_id, created_at DESC);
