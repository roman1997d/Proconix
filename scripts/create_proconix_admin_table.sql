-- Platform administrators (Proconix operator accounts, not company managers).
-- Passwords are stored as bcrypt hashes (same approach as manager/users).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_proconix_admin_table.sql

CREATE TABLE IF NOT EXISTS proconix_admin (
  id              SERIAL PRIMARY KEY,
  full_name       VARCHAR(255) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  address         TEXT,
  enroll_date     DATE NOT NULL,
  admin_rank      VARCHAR(50) NOT NULL DEFAULT 'admin',
  access_level    VARCHAR(80) NOT NULL DEFAULT 'full_acces',
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proconix_admin_email ON proconix_admin (email);
CREATE INDEX IF NOT EXISTS idx_proconix_admin_active ON proconix_admin (active) WHERE active = TRUE;

COMMENT ON TABLE proconix_admin IS 'Proconix platform operators; authenticate via dedicated admin API (bcrypt password_hash).';

-- Seed: Roman Demian — plain password for initial login: 12345678 (change after first deploy).
-- Hash generated with bcrypt cost 10 (Node bcrypt); re-run node if you change password:
--   node -e "require('bcrypt').hash('YOUR_PASSWORD',10).then(console.log)"
INSERT INTO proconix_admin (
  full_name,
  email,
  password_hash,
  address,
  enroll_date,
  admin_rank,
  access_level
) VALUES (
  'Roman Demian',
  'rdemian732@gmail.com',
  '$2b$10$S1ud.V5oneXqZvcOgzYx7uvmTe9wskfpniWCEmBuBHqdpRz6MdL.u',
  'Manchester, Salford',
  '2026-03-22',
  'admin',
  'full_acces'
)
ON CONFLICT (email) DO NOTHING;
