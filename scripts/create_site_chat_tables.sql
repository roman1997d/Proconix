-- Site chat (project room) tables
-- Run: psql -U postgres -d ProconixDB -f scripts/create_site_chat_tables.sql

CREATE TABLE IF NOT EXISTS site_chat_message (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  project_id INT NOT NULL,
  sender_kind VARCHAR(20) NOT NULL CHECK (sender_kind IN ('manager', 'operative')),
  sender_id INT NOT NULL,
  sender_name VARCHAR(255),
  message_type VARCHAR(30) NOT NULL CHECK (message_type IN ('text', 'file', 'material_request', 'system')),
  body TEXT,
  file_name VARCHAR(500),
  file_url VARCHAR(1200),
  request_status VARCHAR(30),
  request_summary TEXT,
  request_details TEXT,
  request_urgency VARCHAR(50),
  request_location VARCHAR(255),
  request_delivered_at TIMESTAMPTZ,
  agent_reminder_at TIMESTAMPTZ,
  is_auto_repost BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_chat_msg_room ON site_chat_message(company_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS site_chat_request_photo (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  project_id INT NOT NULL,
  message_id BIGINT NOT NULL REFERENCES site_chat_message(id) ON DELETE CASCADE,
  file_url VARCHAR(1200) NOT NULL,
  uploaded_by_kind VARCHAR(20) NOT NULL CHECK (uploaded_by_kind IN ('manager', 'operative')),
  uploaded_by_id INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_chat_req_photo_msg ON site_chat_request_photo(message_id, created_at ASC);

CREATE TABLE IF NOT EXISTS site_chat_notification (
  id BIGSERIAL PRIMARY KEY,
  company_id INT NOT NULL,
  project_id INT NOT NULL,
  message_id BIGINT REFERENCES site_chat_message(id) ON DELETE CASCADE,
  recipient_kind VARCHAR(20) NOT NULL CHECK (recipient_kind IN ('manager', 'operative')),
  recipient_id INT NOT NULL,
  kind VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  body TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_site_chat_notif_recipient
  ON site_chat_notification(company_id, project_id, recipient_kind, recipient_id, created_at DESC);

