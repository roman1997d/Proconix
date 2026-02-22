-- Projects for companies (operatives are assigned via users.project_id).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_projects_table.sql

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
