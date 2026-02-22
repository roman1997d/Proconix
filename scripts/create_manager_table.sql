-- Create manager table in ProconixDB if it does not exist.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_manager_table.sql

CREATE TABLE IF NOT EXISTS manager (
  id                   SERIAL PRIMARY KEY,
  company_id           INT NOT NULL,
  name                 VARCHAR(255),
  surname              VARCHAR(255),
  email                VARCHAR(255),
  password             VARCHAR(255),
  active               BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMP DEFAULT NOW(),
  project_onboard_name  VARCHAR(255),
  is_head_manager      VARCHAR(50) DEFAULT 'No',
  active_status        BOOLEAN,
  dezactivation_date    TIME
);

-- Optional: foreign key to companies (uncomment if companies.id exists)
-- ALTER TABLE manager ADD CONSTRAINT fk_manager_company
--   FOREIGN KEY (company_id) REFERENCES companies(id);
