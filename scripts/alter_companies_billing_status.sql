-- Manual billing status for platform admin (Achitat/Activ, Neachitat/Suspendat, Neachitat/Activ).
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_companies_billing_status.sql

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(40);

UPDATE companies
SET billing_status = 'unpaid_active'
WHERE billing_status IS NULL;

COMMENT ON COLUMN companies.billing_status IS 'paid_active | unpaid_suspended | unpaid_active';
