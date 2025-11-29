-- ======================================
-- Unified bookmark table for posts and comments
-- ======================================
CREATE TABLE topic_content_bookmarks (
  content_type TEXT NOT NULL,                -- 'post' or 'comment'
  content_id   INTEGER NOT NULL,             -- id from topic_posts or topic_post_comments
  account      TEXT NOT NULL,                -- wallet address
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (content_type, content_id, account)
);

-- Bookmarks for a specific target
CREATE INDEX IF NOT EXISTS idx_topic_content_bookmarks_target
  ON topic_content_bookmarks(content_type, content_id);

-- Targets bookmarked by a specific user (for "My bookmarks" screen)
CREATE INDEX IF NOT EXISTS idx_topic_content_bookmarks_account_created_at
  ON topic_content_bookmarks(account, created_at DESC);
