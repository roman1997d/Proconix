-- Operative onboarding: after first login (temporary password + set new password),
-- the column onboarding is set to 'yes'. Then the user logs in only with email + password.
--
-- Run in your database (ProconixDB):
--
--   psql -U postgres -d ProconixDB -f scripts/add_onboarding_to_users.sql
--
-- Or in pgAdmin / DBeaver: open this file and execute the SQL below.

-- Add column (if it already exists, nothing happens)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding VARCHAR(10) DEFAULT 'no';

-- Optional: set existing users who already have a password to 'yes' so they can log in with email+password
-- (uncomment the next line if you have old operatives who already set their password)
-- UPDATE users SET onboarding = 'yes' WHERE password IS NOT NULL AND (onboarding IS NULL OR onboarding = 'no');
