-- Tasks assigned to operatives (user_id).
-- Run: psql -U postgres -d ProconixDB -f scripts/create_tasks_table.sql

CREATE TABLE IF NOT EXISTS tasks (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL,
  project_id  INT,
  name        VARCHAR(255) NOT NULL,
  deadline    DATE,
  status      VARCHAR(50) DEFAULT 'pending',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
