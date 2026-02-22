-- Quality Assurance module – all tables.
-- Run after: create_companies_table.sql, create_projects_table.sql
-- Example: psql -U postgres -d ProconixDB -f scripts/create_qa_tables.sql

-- Lookup: worker categories
CREATE TABLE IF NOT EXISTS qa_worker_categories (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

-- Lookup: cost types
CREATE TABLE IF NOT EXISTS qa_cost_types (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

-- Lookup: job statuses
CREATE TABLE IF NOT EXISTS qa_job_statuses (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

-- Floors (global project_id NULL or per project)
CREATE TABLE IF NOT EXISTS qa_floors (
  id         SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE SET NULL,
  code       VARCHAR(50) NOT NULL,
  label      VARCHAR(255) NOT NULL,
  sort_order INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qa_floors_project_id ON qa_floors(project_id);

-- Supervisors (per company)
CREATE TABLE IF NOT EXISTS qa_supervisors (
  id         SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  name       VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_supervisors_company_id ON qa_supervisors(company_id);

-- Workers (per company, with category)
CREATE TABLE IF NOT EXISTS qa_workers (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL,
  name        VARCHAR(500) NOT NULL,
  category_id INT NOT NULL REFERENCES qa_worker_categories(id),
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_workers_company_id ON qa_workers(company_id);
CREATE INDEX IF NOT EXISTS idx_qa_workers_category_id ON qa_workers(category_id);

-- Templates (createdBy stored as display name for simplicity)
CREATE TABLE IF NOT EXISTS qa_templates (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  created_by  VARCHAR(255),
  updated_at  TIMESTAMP,
  updated_by  VARCHAR(255)
);

-- Template steps (one row per step)
CREATE TABLE IF NOT EXISTS qa_template_steps (
  id                SERIAL PRIMARY KEY,
  template_id       INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  description       TEXT,
  price_per_m2      VARCHAR(100),
  price_per_unit    VARCHAR(100),
  price_per_linear   VARCHAR(100),
  step_external_id  VARCHAR(100),
  created_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_template_steps_template_id ON qa_template_steps(template_id);

-- Jobs (floor_id from qa_floors; floor_code fallback for raw value from frontend)
CREATE TABLE IF NOT EXISTS qa_jobs (
  id                     SERIAL PRIMARY KEY,
  project_id             INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  job_number             VARCHAR(50) NOT NULL,
  floor_id               INT REFERENCES qa_floors(id),
  floor_code             VARCHAR(50),
  location               VARCHAR(500),
  sqm                    VARCHAR(100),
  linear_meters          VARCHAR(100),
  specification          VARCHAR(500),
  description            TEXT,
  target_completion_date DATE,
  cost_included          BOOLEAN DEFAULT FALSE,
  cost_type_id           INT REFERENCES qa_cost_types(id),
  cost_value             VARCHAR(100),
  responsible_id         INT REFERENCES qa_supervisors(id),
  status_id              INT NOT NULL REFERENCES qa_job_statuses(id),
  created_at             TIMESTAMP DEFAULT NOW(),
  created_by             VARCHAR(255),
  updated_at             TIMESTAMP,
  updated_by             VARCHAR(255),
  CONSTRAINT uq_qa_jobs_project_number UNIQUE (project_id, job_number)
);
CREATE INDEX IF NOT EXISTS idx_qa_jobs_project_id ON qa_jobs(project_id);
CREATE INDEX IF NOT EXISTS idx_qa_jobs_status_id ON qa_jobs(status_id);
CREATE INDEX IF NOT EXISTS idx_qa_jobs_target_date ON qa_jobs(target_completion_date);

-- Job – Template (many-to-many)
CREATE TABLE IF NOT EXISTS qa_job_templates (
  id          SERIAL PRIMARY KEY,
  job_id      INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  template_id INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_templates UNIQUE (job_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_job_templates_job ON qa_job_templates(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_templates_template ON qa_job_templates(template_id);

-- Job – Workers (many-to-many)
CREATE TABLE IF NOT EXISTS qa_job_workers (
  id         SERIAL PRIMARY KEY,
  job_id     INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  worker_id  INT NOT NULL REFERENCES qa_workers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_workers UNIQUE (job_id, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_job_workers_job ON qa_job_workers(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_workers_worker ON qa_job_workers(worker_id);
