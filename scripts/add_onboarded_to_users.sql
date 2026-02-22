-- Operatives: first login is temp password + set new password; after that they use email + password.
-- Run: psql -U postgres -d ProconixDB -f scripts/add_onboarded_to_users.sql

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN users.onboarded IS 'TRUE after operative has set their password (first login done).';
