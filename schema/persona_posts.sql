CREATE TABLE persona_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL,                      -- wallet address

  content TEXT NOT NULL,                     -- text content of the post
  attachments TEXT,                          -- JSON list: attached files

  -- Twitter-like structure
  parent_post_id INTEGER,                    -- if this post is a comment, ID of the parent post
  repost_of_id INTEGER,                      -- repost target
  quote_of_id INTEGER,                       -- quote target

  -- Aggregated counters
  view_count      INTEGER NOT NULL DEFAULT 0,   -- number of views
  like_count      INTEGER NOT NULL DEFAULT 0,   -- number of likes
  comment_count   INTEGER NOT NULL DEFAULT 0,   -- number of comments
  repost_count    INTEGER NOT NULL DEFAULT 0,   -- number of reposts
  quote_count     INTEGER NOT NULL DEFAULT 0,   -- number of quotes
  bookmark_count  INTEGER NOT NULL DEFAULT 0,   -- number of bookmarks

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,

  FOREIGN KEY (parent_post_id) REFERENCES persona_posts(id),
  FOREIGN KEY (repost_of_id)   REFERENCES persona_posts(id),
  FOREIGN KEY (quote_of_id)    REFERENCES persona_posts(id)
);

-- Indexes commonly used for queries

-- Posts by a specific user (timeline / profile posts)
CREATE INDEX IF NOT EXISTS idx_persona_posts_author
  ON persona_posts(author);

-- Comments under a specific post
CREATE INDEX IF NOT EXISTS idx_persona_posts_parent_post_id
  ON persona_posts(parent_post_id);

-- Reposts of a specific original post
CREATE INDEX IF NOT EXISTS idx_persona_posts_repost_of
  ON persona_posts(repost_of_id);

-- Quotes of a specific original post
CREATE INDEX IF NOT EXISTS idx_persona_posts_quote_of
  ON persona_posts(quote_of_id);
