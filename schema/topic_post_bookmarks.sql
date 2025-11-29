-- ======================================
-- Bookmark table for topic posts
-- ======================================
CREATE TABLE topic_post_bookmarks (
  post_id INTEGER NOT NULL,                  -- FK to topic_posts.id
  account TEXT NOT NULL,                     -- wallet address
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (post_id, account),            -- one bookmark per user per post
  FOREIGN KEY (post_id) REFERENCES topic_posts(id)
);

-- Query: users who bookmarked a post
CREATE INDEX IF NOT EXISTS idx_topic_post_bookmarks_post_id
  ON topic_post_bookmarks(post_id);

-- Query: posts bookmarked by a specific user
CREATE INDEX IF NOT EXISTS idx_topic_post_bookmarks_account
  ON topic_post_bookmarks(account);
