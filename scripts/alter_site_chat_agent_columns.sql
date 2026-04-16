-- Chat Agent: delivery timestamp + one-shot reminder flag for material requests.
-- Run after create_site_chat_tables.sql if the table already exists without these columns.

ALTER TABLE site_chat_message
  ADD COLUMN IF NOT EXISTS request_delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_reminder_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_auto_repost BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE site_chat_message
  ADD COLUMN IF NOT EXISTS repost_of_message_id BIGINT REFERENCES site_chat_message(id) ON DELETE SET NULL;
