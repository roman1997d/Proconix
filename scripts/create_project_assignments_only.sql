-- Create only project_assignments (for Assign Operatives feature).
-- Run if you get 500 on POST /api/projects/:id/assign
-- Example: psql -U postgres -d ProconixDB -f scripts/create_project_assignments_only.sql

CREATE TABLE IF NOT EXISTS project_assignments (
  id          SERIAL PRIMARY KEY,
  project_id  INT NOT NULL,
  user_id     INT NOT NULL,
  role        VARCHAR(100),
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_assignments_project ON project_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_user ON project_assignments(user_id);
