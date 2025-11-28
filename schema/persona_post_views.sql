CREATE TABLE persona_post_views (
  post_id INTEGER NOT NULL,
  viewer_hash TEXT NOT NULL,   -- hashed session ID / cookie / userID / wallet address
  last_viewed_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),  -- UTC timestamp (sec)

  PRIMARY KEY (post_id, viewer_hash),
  FOREIGN KEY (post_id) REFERENCES persona_posts(id)
);
