-- Planning (Task & Planning module): Plan + PlanTasks
-- Run: psql -U postgres -d ProconixDB -f scripts/create_planning_tables.sql

-- Plan table
CREATE TABLE IF NOT EXISTS planning_plans (
  id            SERIAL PRIMARY KEY,
  company_id   INT NOT NULL,
  type          VARCHAR(20) NOT NULL CHECK (type IN ('daily','weekly','monthly')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  created_by    INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planning_plans_company ON planning_plans(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_planning_plans_dates ON planning_plans(start_date, end_date);

-- Plan tasks
CREATE TABLE IF NOT EXISTS planning_plan_tasks (
  id                  SERIAL PRIMARY KEY,
  plan_id             INT NOT NULL REFERENCES planning_plans(id) ON DELETE CASCADE,
  title               VARCHAR(255) NOT NULL,
  description         TEXT,
  assigned_to        TEXT[] NOT NULL DEFAULT '{}',
  priority            VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low','medium','high','critical')),
  deadline            TIMESTAMPTZ NOT NULL,
  pickup_start_date  DATE NOT NULL,
  notes               TEXT,
  status              VARCHAR(20) NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started','in_progress','paused','completed')),
  send_to_assignees  BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planning_plan_tasks_plan_id ON planning_plan_tasks(plan_id);
CREATE INDEX IF NOT EXISTS idx_planning_plan_tasks_deadline ON planning_plan_tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_planning_plan_tasks_status ON planning_plan_tasks(status);

