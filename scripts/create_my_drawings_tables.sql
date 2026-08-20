-- My Drawings PWA: shared catalog (admin writes, workers read the same data).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_my_drawings_tables.sql
-- The Node server also creates these tables on startup if they are missing.

CREATE TABLE IF NOT EXISTS my_drawings_workspace (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  access_pin_hash TEXT NOT NULL,
  admin_pin_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  demo_cleared_at TIMESTAMPTZ
);

ALTER TABLE my_drawings_workspace
  ADD COLUMN IF NOT EXISTS demo_cleared_at TIMESTAMPTZ;

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

CREATE TABLE IF NOT EXISTS my_drawings_worker (
  id SERIAL PRIMARY KEY,
  workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
  first_name VARCHAR(80) NOT NULL,
  last_name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  pin_hash TEXT,
  pin_sha VARCHAR(64),
  pin_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_my_drawings_worker_email UNIQUE (workspace_id, email)
);

CREATE INDEX IF NOT EXISTS idx_my_drawings_worker_ws ON my_drawings_worker(workspace_id);

CREATE TABLE IF NOT EXISTS my_drawings_device (
  id SERIAL PRIMARY KEY,
  worker_id INT NOT NULL REFERENCES my_drawings_worker(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_my_drawings_device_token UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_my_drawings_device_worker ON my_drawings_device(worker_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_my_drawings_worker_pin_sha
  ON my_drawings_worker(workspace_id, pin_sha)
  WHERE pin_sha IS NOT NULL;

CREATE TABLE IF NOT EXISTS my_drawings_activity (
  id SERIAL PRIMARY KEY,
  workspace_id INT NOT NULL REFERENCES my_drawings_workspace(id) ON DELETE CASCADE,
  actor_name VARCHAR(160) NOT NULL,
  action VARCHAR(40) NOT NULL,
  drawing_title VARCHAR(200),
  drawing_number VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_my_drawings_activity_ws ON my_drawings_activity(workspace_id, created_at DESC);
