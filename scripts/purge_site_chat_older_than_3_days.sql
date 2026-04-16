-- Delete all site chat messages older than 3 days (including material requests).
-- Dependent rows cascade: site_chat_request_photo (message_id), site_chat_notification (message_id).
--
-- Run (example):
--   psql -U postgres -d ProconixDB -f scripts/purge_site_chat_older_than_3_days.sql
--
-- Or from project root:
--   npm run purge:site-chat

BEGIN;

DELETE FROM site_chat_message
WHERE created_at < NOW() - INTERVAL '3 days';

COMMIT;
