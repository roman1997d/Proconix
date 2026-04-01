-- Max seats per company (managers + operatives). NULL = no cap.
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_companies_user_limit.sql

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS user_limit INTEGER NULL;

COMMENT ON COLUMN companies.user_limit IS 'Optional cap on total users (manager rows + users rows) for this company; NULL = unlimited.';
