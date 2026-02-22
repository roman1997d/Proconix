-- Projects: add end_date and status. Create project_assignments.
-- Run: psql -U postgres -d ProconixDB -f scripts/update_projects_and_assignments.sql

-- Add columns to projects if missing
ALTER TABLE projects ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Project assignments (operatives assigned to projects)
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
