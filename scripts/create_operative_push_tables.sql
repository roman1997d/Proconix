-- Push notifications: device tokens + preferences for operative mobile apps.
-- Run: psql -U postgres -d ProconixDB -f scripts/create_operative_push_tables.sql

CREATE TABLE IF NOT EXISTS operative_push_devices (
  id              SERIAL PRIMARY KEY,
  user_id         INT NOT NULL,
  platform        VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  fcm_token       VARCHAR(512) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_operative_push_devices_user ON operative_push_devices(user_id);

COMMENT ON TABLE operative_push_devices IS 'FCM registration tokens per operative user (multiple devices allowed).';

CREATE TABLE IF NOT EXISTS operative_notification_prefs (
  user_id         INT PRIMARY KEY,
  push_chat       BOOLEAN NOT NULL DEFAULT TRUE,
  push_tasks      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE operative_notification_prefs IS 'Per-user toggles for push categories (chat vs planning tasks).';
