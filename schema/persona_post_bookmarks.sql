-- ======================================
-- persona_post_bookmarks
-- ======================================
CREATE TABLE IF NOT EXISTS persona_post_bookmarks (
  post_id INTEGER NOT NULL,                  -- same type as persona_posts.id (INTEGER)
  account TEXT NOT NULL,                     -- wallet address
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (post_id, account),
  FOREIGN KEY (post_id) REFERENCES persona_posts(id)
);

-- Posts bookmarked by a specific user
CREATE INDEX IF NOT EXISTS idx_persona_post_bookmarks_account_created_at
  ON persona_post_bookmarks(account, created_at DESC);
