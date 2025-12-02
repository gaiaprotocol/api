-- ======================================
-- persona_posts
-- ======================================
CREATE TABLE persona_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author TEXT NOT NULL,                      -- wallet address
  author_ip TEXT,                            -- IP address at post creation

  content TEXT NOT NULL,                     -- text content of the post
  attachments TEXT,                          -- JSON list of attached files

  -- Twitter-like structure
  parent_post_id INTEGER,                    -- if this post is a comment, ID of the parent post
  repost_of_id INTEGER,                      -- repost target
  quote_of_id INTEGER,                       -- quote target

  -- Aggregated counters
  view_count      INTEGER NOT NULL DEFAULT 0,  -- number of views
  like_count      INTEGER NOT NULL DEFAULT 0,  -- number of likes
  comment_count   INTEGER NOT NULL DEFAULT 0,  -- number of comments
  repost_count    INTEGER NOT NULL DEFAULT 0,  -- number of reposts
  quote_count     INTEGER NOT NULL DEFAULT 0,  -- number of quotes
  bookmark_count  INTEGER NOT NULL DEFAULT 0,  -- number of bookmarks

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  is_deleted INTEGER DEFAULT 0,              -- soft delete flag (0 = active, 1 = deleted)
  deleted_at INTEGER,                        -- deletion timestamp (UNIX epoch seconds)

  FOREIGN KEY (parent_post_id) REFERENCES persona_posts(id),
  FOREIGN KEY (repost_of_id)   REFERENCES persona_posts(id),
  FOREIGN KEY (quote_of_id)    REFERENCES persona_posts(id)
);

-- ======================================
-- Indexes for persona_posts
-- ======================================

-- Timeline / profile: non-deleted posts by author, newest first
CREATE INDEX IF NOT EXISTS idx_persona_posts_author_not_deleted_created_at
  ON persona_posts(author, created_at DESC)
  WHERE is_deleted = 0;

-- Comments under a specific post: non-deleted, oldest-first (thread order)
CREATE INDEX IF NOT EXISTS idx_persona_posts_parent_not_deleted_created_at
  ON persona_posts(parent_post_id, created_at)
  WHERE is_deleted = 0;

-- Reposts of a specific original post: non-deleted
CREATE INDEX IF NOT EXISTS idx_persona_posts_repost_not_deleted_created_at
  ON persona_posts(repost_of_id, created_at)
  WHERE is_deleted = 0;

-- Quotes of a specific original post: non-deleted
CREATE INDEX IF NOT EXISTS idx_persona_posts_quote_not_deleted_created_at
  ON persona_posts(quote_of_id, created_at)
  WHERE is_deleted = 0;
