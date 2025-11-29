-- ======================================
-- Voting table for topic posts
-- ======================================
CREATE TABLE topic_post_votes (
  post_id INTEGER NOT NULL,                  -- FK to topic_posts.id
  account TEXT NOT NULL,                     -- wallet address (voter)
  vote_value INTEGER NOT NULL,               -- -1 = downvote, 1 = upvote
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,

  PRIMARY KEY (post_id, account),            -- one vote per user per post
  FOREIGN KEY (post_id) REFERENCES topic_posts(id)
);

-- Index: all votes for a specific post
CREATE INDEX IF NOT EXISTS idx_topic_post_votes_post_id
  ON topic_post_votes(post_id);

-- Index: posts voted by a specific user
CREATE INDEX IF NOT EXISTS idx_topic_post_votes_account
  ON topic_post_votes(account);
