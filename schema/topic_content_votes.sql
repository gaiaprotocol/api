-- ======================================
-- Unified voting table for posts and comments
-- ======================================
CREATE TABLE topic_content_votes (
  content_type TEXT NOT NULL,                -- 'post' or 'comment'
  content_id   INTEGER NOT NULL,             -- id from topic_posts or topic_post_comments
  account      TEXT NOT NULL,                -- wallet address (voter)
  vote_value   INTEGER NOT NULL,             -- -1 = downvote, 1 = upvote
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at   INTEGER,

  PRIMARY KEY (content_type, content_id, account)
  -- NOTE: cannot enforce FK to two different tables at once; validate at application level
);

-- Targets voted by a specific user (for "My votes" screen)
CREATE INDEX IF NOT EXISTS idx_topic_content_votes_account_created_at
  ON topic_content_votes(account, created_at DESC);
