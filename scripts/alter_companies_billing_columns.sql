-- Billing / subscription metadata for companies (platform admin Billing & plans).
-- Run: psql -U postgres -d ProconixDB -f scripts/alter_companies_billing_columns.sql

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS plan_purchased_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(80),
  ADD COLUMN IF NOT EXISTS billing_status VARCHAR(40);

UPDATE companies SET billing_status = 'unpaid_active' WHERE billing_status IS NULL;

COMMENT ON COLUMN companies.plan_purchased_at IS 'When the current plan was purchased or started.';
COMMENT ON COLUMN companies.plan_expires_at IS 'When the current plan period ends (renewal / expiry).';
COMMENT ON COLUMN companies.payment_method IS 'e.g. registration, card, invoice, manual, free';
COMMENT ON COLUMN companies.billing_status IS 'paid_active | unpaid_suspended | unpaid_active';
