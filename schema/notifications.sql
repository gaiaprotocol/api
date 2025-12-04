-- =====================================================
-- notifications
-- Generic notification table for all future features.
-- This schema is intentionally minimal and extensible.
-- =====================================================
CREATE TABLE IF NOT EXISTS notifications (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,

  -- The user/account who receives this notification.
  recipient             TEXT NOT NULL,

  -- The actor who triggered this notification.
  -- Could be a wallet address, user ID, persona address, or system.
  actor                 TEXT,

  -- A string describing the actor type (e.g., 'wallet', 'persona', 'user', 'system').
  actor_type            TEXT,

  -- Namespaced notification type (e.g., 'post.like', 'post.comment',
  -- 'persona.buy', 'system.announcement').
  notification_type     TEXT NOT NULL,

  -- Optional ID representing the target entity.
  -- Could be a post ID, persona address, transaction hash, etc.
  target_id             TEXT,

  -- JSON metadata for any extra structured fields (e.g., amounts, prices,
  -- target_type, navigate_path, etc.).
  metadata              TEXT,

  -- Read state: 0 = unread (default), 1 = read.
  is_read               INTEGER NOT NULL DEFAULT 0,

  -- Timestamp when the notification was marked as read.
  read_at               INTEGER,

  -- Creation timestamp (UNIX epoch seconds).
  created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- =====================================================
-- Index: Default notification feed (per user, newest first)
-- Used when rendering the main notification timeline.
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
  ON notifications (recipient, created_at DESC);

-- =====================================================
-- Index: Unread notifications (for badge count + quick checks)
-- Allows fast queries of only unread items.
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread_created_at
  ON notifications (recipient, is_read, created_at DESC);
