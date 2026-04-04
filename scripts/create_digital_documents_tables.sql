-- Digital documents & signatures (manager upload, operative sign)
-- Run: psql -U postgres -d ProconixDB -f scripts/create_digital_documents_tables.sql

CREATE TABLE IF NOT EXISTS digital_documents (
  id                    SERIAL PRIMARY KEY,
  company_id            INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_by_manager_id INT REFERENCES manager(id) ON DELETE SET NULL,
  project_id            INT REFERENCES projects(id) ON DELETE SET NULL,
  title                 VARCHAR(500) NOT NULL,
  description           TEXT,
  document_type         VARCHAR(100),
  status                VARCHAR(50) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_signatures', 'completed', 'cancelled', 'expired')),
  file_relative_path    VARCHAR(1000) NOT NULL,
  file_url              VARCHAR(1000) NOT NULL,
  original_filename     VARCHAR(500),
  file_size_bytes       BIGINT,
  fields_json           JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digital_documents_company ON digital_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_digital_documents_status ON digital_documents(status);
CREATE INDEX IF NOT EXISTS idx_digital_documents_project ON digital_documents(project_id);

CREATE TABLE IF NOT EXISTS digital_document_assignments (
  id               SERIAL PRIMARY KEY,
  document_id      INT NOT NULL REFERENCES digital_documents(id) ON DELETE CASCADE,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  deadline         TIMESTAMPTZ,
  mandatory        BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_days  INT,
  assigned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dda_document ON digital_document_assignments(document_id);
CREATE INDEX IF NOT EXISTS idx_dda_user ON digital_document_assignments(user_id);

CREATE TABLE IF NOT EXISTS digital_document_signatures (
  id                        SERIAL PRIMARY KEY,
  document_id               INT NOT NULL REFERENCES digital_documents(id) ON DELETE CASCADE,
  user_id                   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_id                  VARCHAR(100) NOT NULL,
  signature_image_rel_path  VARCHAR(1000) NOT NULL,
  signature_image_url       VARCHAR(1000) NOT NULL,
  confirmed_read            BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  client_meta               JSONB,
  UNIQUE (document_id, user_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_dds_document ON digital_document_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_dds_user ON digital_document_signatures(user_id);

CREATE TABLE IF NOT EXISTS digital_document_audit (
  id            SERIAL PRIMARY KEY,
  document_id   INT NOT NULL REFERENCES digital_documents(id) ON DELETE CASCADE,
  action        VARCHAR(100) NOT NULL,
  actor_type    VARCHAR(20),
  actor_id      INT,
  details       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ddaudit_document ON digital_document_audit(document_id);
