-- Work hours (clock in/out) per user and project.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_work_hours_table.sql

CREATE TABLE IF NOT EXISTS work_hours (
  id         SERIAL PRIMARY KEY,
  user_id    INT NOT NULL,
  project_id INT,
  clock_in   TIMESTAMP NOT NULL DEFAULT NOW(),
  clock_out  TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_work_hours_user_id ON work_hours(user_id);
CREATE INDEX IF NOT EXISTS idx_work_hours_clock_in ON work_hours(clock_in);
