-- =============================================================================
-- Setup pentru Projects + Assign Operatives + users.project_id
-- Rulează o singură dată: psql -U postgres -d ProconixDB -f scripts/setup_projects_and_assignments.sql
-- =============================================================================

-- 1. Tabelul users trebuie să aibă coloana project_id (legătura cu proiectul)
--    Dacă tabelul users există deja fără project_id, o adăugăm:
ALTER TABLE users ADD COLUMN IF NOT EXISTS project_id INT;

-- Index pentru căutări după project_id (opțional, pentru performanță)
CREATE INDEX IF NOT EXISTS idx_users_project_id ON users(project_id);

-- 2. Tabelul project_assignments (pentru Assign Operatives/Managers)
CREATE TABLE IF NOT EXISTS project_assignments (
  id          SERIAL PRIMARY KEY,
  project_id  INT NOT NULL,
  user_id     INT NOT NULL,
  role        VARCHAR(100),
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_assignments_project ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_user ON project_assignments(user_id);

-- 3. Tabelul projects – doar dacă nu există (nu suprascriem ce ai deja)
--    Dacă ai deja projects cu coloane: name, address, start_date, description → e suficient.
--    Dacă vrei structura completă (project_name, planned_end_date, number_of_floors, active etc.),
--    rulează separat: scripts/create_projects_table_spec.sql sau scripts/migrate_projects_to_spec.sql
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
