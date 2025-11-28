CREATE TABLE IF NOT EXISTS persona_post_bookmarks (
  post_id INTEGER NOT NULL,                     -- same type as persona_posts.id (INTEGER)
  account TEXT NOT NULL,                        -- profiles.account (wallet address)
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (post_id, account),

  FOREIGN KEY (post_id) REFERENCES persona_posts(id),
  FOREIGN KEY (account) REFERENCES profiles(account)
);

-- Query: users who bookmarked a post
CREATE INDEX IF NOT EXISTS idx_persona_post_bookmarks_post_id
  ON persona_post_bookmarks(post_id);

-- Query: posts bookmarked by a user
CREATE INDEX IF NOT EXISTS idx_persona_post_bookmarks_account
  ON persona_post_bookmarks(account);
