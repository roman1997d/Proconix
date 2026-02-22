-- Work Logs: jobs submitted by operatives, managed by managers.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_work_logs_table.sql

CREATE TABLE IF NOT EXISTS work_logs (
  id                SERIAL PRIMARY KEY,
  company_id        INT NOT NULL,
  submitted_by_user_id INT,
  project_id        INT,
  job_display_id    VARCHAR(50) NOT NULL,
  worker_name       VARCHAR(255) NOT NULL,
  project           VARCHAR(255),
  block             VARCHAR(100),
  floor             VARCHAR(100),
  apartment         VARCHAR(100),
  zone              VARCHAR(100),
  work_type         VARCHAR(255),
  quantity          NUMERIC(12, 2),
  unit_price        NUMERIC(12, 2),
  total             NUMERIC(12, 2),
  status            VARCHAR(50) NOT NULL DEFAULT 'pending',
  description       TEXT,
  submitted_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  work_was_edited   BOOLEAN DEFAULT FALSE,
  edit_history      JSONB DEFAULT '[]',
  photo_urls        JSONB DEFAULT '[]',
  invoice_file_path VARCHAR(500),
  archived          BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_work_logs_company_id ON work_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_submitted_by ON work_logs(submitted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_work_logs_status ON work_logs(status);
CREATE INDEX IF NOT EXISTS idx_work_logs_submitted_at ON work_logs(submitted_at);
CREATE INDEX IF NOT EXISTS idx_work_logs_archived ON work_logs(archived);
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_logs_job_display_id_company ON work_logs(company_id, job_display_id);

COMMENT ON TABLE work_logs IS 'Jobs submitted by operatives; managers view, edit, approve, archive.';
COMMENT ON COLUMN work_logs.job_display_id IS 'Display id e.g. WL-001 (unique per company).';
COMMENT ON COLUMN work_logs.edit_history IS 'Array of { field, oldVal, newVal, editor, at }.';
COMMENT ON COLUMN work_logs.photo_urls IS 'Array of photo URLs.';
