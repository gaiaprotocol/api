CREATE TABLE persona_post_likes (
  post_id INTEGER NOT NULL,
  account TEXT NOT NULL,                     -- profile.account (wallet address)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (post_id, account),
  FOREIGN KEY (post_id) REFERENCES persona_posts(id),
  FOREIGN KEY (account) REFERENCES profiles(account)
);

-- Query: list of likes per post
CREATE INDEX IF NOT EXISTS idx_persona_post_likes_post_id
  ON persona_post_likes(post_id);

-- Query: posts liked by a user
CREATE INDEX IF NOT EXISTS idx_persona_post_likes_account
  ON persona_post_likes(account);
