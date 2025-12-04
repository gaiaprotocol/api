-- Stores unread notification count per user
CREATE TABLE IF NOT EXISTS notification_unread_counters (
  recipient      TEXT PRIMARY KEY,                       -- user/account ID
  unread_count   INTEGER NOT NULL DEFAULT 0,             -- number of unread notifications
  updated_at     INTEGER NOT NULL DEFAULT (strftime('%s','now'))  -- last update timestamp
);
