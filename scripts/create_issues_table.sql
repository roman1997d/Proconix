-- Issues reported by operatives on a project.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_issues_table.sql

CREATE TABLE IF NOT EXISTS issues (
  id          SERIAL PRIMARY KEY,
  user_id     INT NOT NULL,
  project_id  INT,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  file_url    VARCHAR(500),
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_issues_user_id ON issues(user_id);
CREATE INDEX IF NOT EXISTS idx_issues_project_id ON issues(project_id);
