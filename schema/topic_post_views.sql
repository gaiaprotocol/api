-- ======================================
-- View table for topic posts
-- ======================================
CREATE TABLE topic_post_views (
  post_id INTEGER NOT NULL,                  -- FK to topic_posts.id
  viewer_hash TEXT NOT NULL,                 -- hashed session ID / cookie / userID / wallet address
  last_viewed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),  -- UTC timestamp (sec)

  PRIMARY KEY (post_id, viewer_hash),        -- one row per viewer per post
  FOREIGN KEY (post_id) REFERENCES topic_posts(id)
);
