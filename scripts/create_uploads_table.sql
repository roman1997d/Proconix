-- Uploads (invoices, bookings) by operatives.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_uploads_table.sql

CREATE TABLE IF NOT EXISTS uploads (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL,
  project_id  INT,
  file_url    VARCHAR(500) NOT NULL,
  description TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_user_id ON uploads(user_id);
