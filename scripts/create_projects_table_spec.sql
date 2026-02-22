-- Projects table per Proconix spec (FINAL).
-- Run on fresh DB: psql -U postgres -d ProconixDB -f scripts/create_projects_table_spec.sql
-- If projects table already exists with different structure, use migrate_projects_to_spec.sql instead.

CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_pass_key VARCHAR(255),
  created_by_who VARCHAR(255),
  project_name VARCHAR(255),
  address TEXT,
  start_date DATE,
  planned_end_date DATE,
  number_of_floors INT,
  description TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deactivate_by_who VARCHAR(255)
);

CREATE INDEX idx_projects_company_id ON projects(company_id);
