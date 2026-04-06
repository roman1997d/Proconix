-- Crews (teams of operatives) + crew membership
-- Run after users/companies exist.

CREATE TABLE IF NOT EXISTS crews (
  id              SERIAL PRIMARY KEY,
  company_id      INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  leader_user_id  INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  subcontractor   VARCHAR(255),
  description     TEXT,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crews_company ON crews(company_id);
CREATE INDEX IF NOT EXISTS idx_crews_leader ON crews(leader_user_id);

CREATE TABLE IF NOT EXISTS crew_members (
  crew_id         INT NOT NULL REFERENCES crews(id) ON DELETE CASCADE,
  user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_crew    VARCHAR(100) NOT NULL DEFAULT 'Member',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (crew_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members(user_id);

CREATE TABLE IF NOT EXISTS manager_notifications (
  id              SERIAL PRIMARY KEY,
  company_id      INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_manager_notifications_company ON manager_notifications(company_id, created_at DESC);
