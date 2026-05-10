-- Pending collaboration codes until the host submits a work log.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_operative_collaboration_sessions.sql

CREATE TABLE IF NOT EXISTS operative_collaboration_sessions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(16) NOT NULL UNIQUE,
  company_id INT NOT NULL,
  project_id INT NOT NULL,
  host_user_id INT NOT NULL,
  guest_user_ids INTEGER[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_op_collab_sess_host ON operative_collaboration_sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_op_collab_sess_exp ON operative_collaboration_sessions(expires_at);

COMMENT ON TABLE operative_collaboration_sessions IS 'Host generates a code; guests join before host submits one shared work log.';
