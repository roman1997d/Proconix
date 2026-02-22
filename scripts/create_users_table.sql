-- Operatives/supervisors and other company users (linked to company_id).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_users_table.sql

CREATE TABLE IF NOT EXISTS users (
  id           SERIAL PRIMARY KEY,
  company_id   INT NOT NULL,
  project_id   INT,
  role         VARCHAR(100),
  name         VARCHAR(500),
  email        VARCHAR(255) NOT NULL,
  password     VARCHAR(255),
  active       BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT NOW(),
  active_status BOOLEAN DEFAULT FALSE,
  CONSTRAINT uq_users_email_company UNIQUE (email, company_id)
);

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
