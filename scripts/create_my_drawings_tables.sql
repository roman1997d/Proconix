-- My Drawings PWA: shared catalog (admin writes, workers read the same data).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_my_drawings_tables.sql
-- The Node server also creates these tables on startup if they are missing.

CREATE TABLE IF NOT EXISTS my_drawings_workspace (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  access_pin_hash TEXT NOT NULL,
  admin_pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS my_drawings_category (
  id SERIAL PRIMARY KEY,
  workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  CONSTRAINT uq_my_drawings_category UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS idx_my_drawings_category_ws ON my_drawings_category(workspace_id);

CREATE TABLE IF NOT EXISTS my_drawings_item (
  id SERIAL PRIMARY KEY,
  workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
  category_id INT REFERENCES my_drawings_category(id) ON DELETE SET NULL,
  number VARCHAR(40) NOT NULL,
  title VARCHAR(200) NOT NULL,
  revision VARCHAR(12) NOT NULL DEFAULT 'A',
  size_bytes BIGINT,
  stored_filename VARCHAR(500),
  relative_path VARCHAR(1200),
  mime_type VARCHAR(200) DEFAULT 'application/pdf',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_my_drawings_item_number UNIQUE (workspace_id, number)
);

CREATE INDEX IF NOT EXISTS idx_my_drawings_item_ws ON my_drawings_item(workspace_id);
