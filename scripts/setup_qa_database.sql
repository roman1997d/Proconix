-- =============================================================================
-- Proconix – Script complet pentru baza de date (incl. Quality Assurance)
-- Rulează o singură dată: psql -U postgres -d ProconixDB -f scripts/setup_qa_database.sql
-- (Înlocuiește postgres/ProconixDB cu user-ul și baza ta.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. COMPANII (dacă nu există deja)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(255),
  industry_type     VARCHAR(255),
  subscription_plan VARCHAR(255),
  active            VARCHAR(50) DEFAULT 'not_active',
  created_at        TIMESTAMP DEFAULT NOW(),
  created_by        VARCHAR(255),
  security_question1 VARCHAR(255),
  security_token1   VARCHAR(255),
  office_address    VARCHAR(500)
);

-- -----------------------------------------------------------------------------
-- 2. PROIECTE (depind de company_id; tabelul projects trebuie să existe)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL,
  name        VARCHAR(255),
  address     VARCHAR(500),
  start_date  DATE,
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_projects_company_id ON projects(company_id);

-- -----------------------------------------------------------------------------
-- 3. QA – Tabele lookup
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_worker_categories (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS qa_cost_types (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS qa_job_statuses (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(50) UNIQUE NOT NULL,
  label      VARCHAR(255) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 4. QA – Etaje (pot fi globale sau per proiect)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_floors (
  id         SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id) ON DELETE SET NULL,
  code       VARCHAR(50) NOT NULL,
  label      VARCHAR(255) NOT NULL,
  sort_order INT DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_qa_floors_project_id ON qa_floors(project_id);

-- -----------------------------------------------------------------------------
-- 5. QA – Supervizori și workers (per companie)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_supervisors (
  id         SERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  name       VARCHAR(500) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_supervisors_company_id ON qa_supervisors(company_id);

CREATE TABLE IF NOT EXISTS qa_workers (
  id          SERIAL PRIMARY KEY,
  company_id  INT NOT NULL,
  name        VARCHAR(500) NOT NULL,
  category_id INT NOT NULL REFERENCES qa_worker_categories(id),
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_workers_company_id ON qa_workers(company_id);
CREATE INDEX IF NOT EXISTS idx_qa_workers_category_id ON qa_workers(category_id);

-- -----------------------------------------------------------------------------
-- 6. QA – Template-uri și pași
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_templates (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(500) NOT NULL,
  created_at  TIMESTAMP DEFAULT NOW(),
  created_by  VARCHAR(255),
  updated_at  TIMESTAMP,
  updated_by  VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS qa_template_steps (
  id                SERIAL PRIMARY KEY,
  template_id       INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  sort_order        INT NOT NULL DEFAULT 0,
  description       TEXT,
  price_per_m2      VARCHAR(100),
  price_per_unit    VARCHAR(100),
  price_per_linear  VARCHAR(100),
  step_external_id  VARCHAR(100),
  created_at        TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_template_steps_template_id ON qa_template_steps(template_id);

-- -----------------------------------------------------------------------------
-- 7. QA – Joburi
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 8. QA – Legături job ↔ template și job ↔ workers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qa_job_templates (
  id          SERIAL PRIMARY KEY,
  job_id      INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  template_id INT NOT NULL REFERENCES qa_templates(id) ON DELETE CASCADE,
  created_at  TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_templates UNIQUE (job_id, template_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_job_templates_job ON qa_job_templates(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_templates_template ON qa_job_templates(template_id);

CREATE TABLE IF NOT EXISTS qa_job_workers (
  id         SERIAL PRIMARY KEY,
  job_id     INT NOT NULL REFERENCES qa_jobs(id) ON DELETE CASCADE,
  worker_id  INT NOT NULL REFERENCES qa_workers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT uq_qa_job_workers UNIQUE (job_id, worker_id)
);
CREATE INDEX IF NOT EXISTS idx_qa_job_workers_job ON qa_job_workers(job_id);
CREATE INDEX IF NOT EXISTS idx_qa_job_workers_worker ON qa_job_workers(worker_id);

-- -----------------------------------------------------------------------------
-- 9. SEED – Date inițiale pentru QA (lookup)
-- -----------------------------------------------------------------------------
INSERT INTO qa_worker_categories (code, label) VALUES
  ('fixers', 'Fixers'),
  ('plaster', 'Plaster'),
  ('electricians', 'Electricians'),
  ('painters', 'Painters')
ON CONFLICT (code) DO NOTHING;

INSERT INTO qa_cost_types (code, label) VALUES
  ('day', 'Day work'),
  ('hour', 'Hour work'),
  ('price', 'Price work')
ON CONFLICT (code) DO NOTHING;

INSERT INTO qa_job_statuses (code, label) VALUES
  ('new', 'New'),
  ('active', 'Active'),
  ('completed', 'Completed')
ON CONFLICT (code) DO NOTHING;

INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, 'ground', 'Ground', 0
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = 'ground');
INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, '1', 'Floor 1', 1
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = '1');
INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, '2', 'Floor 2', 2
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = '2');
INSERT INTO qa_floors (project_id, code, label, sort_order)
SELECT NULL, '3', 'Floor 3', 3
WHERE NOT EXISTS (SELECT 1 FROM qa_floors WHERE project_id IS NULL AND code = '3');

-- =============================================================================
-- Sfârșit. După rulare, baza are tabelele necesare pentru modulul Quality Assurance.
-- Restul aplicației Proconix (manager, users, work_logs etc.) folosesc scripturile
-- din același folder (create_manager_table.sql, create_users_table.sql, etc.).
-- =============================================================================
