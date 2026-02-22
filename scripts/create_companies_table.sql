-- Run this in your ProconixDB database if the "companies" table does not exist.
-- Example: psql -U postgres -d ProconixDB -f scripts/create_companies_table.sql

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
