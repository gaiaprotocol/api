-- ======================================
-- topic_posts
-- ======================================
CREATE TABLE topic_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  author TEXT NOT NULL,                      -- wallet address
  author_ip TEXT,                            -- IP address at post creation

  title TEXT NOT NULL,
  content TEXT,                              -- text content of the post
  attachments TEXT,                          -- JSON list of attached files

  -- Aggregated counters
  view_count      INTEGER NOT NULL DEFAULT 0,  -- number of views
  upvote_count    INTEGER NOT NULL DEFAULT 0,  -- upvotes on this post
  downvote_count  INTEGER NOT NULL DEFAULT 0,  -- downvotes on this post
  comment_count   INTEGER NOT NULL DEFAULT 0,  -- number of direct comments
  bookmark_count  INTEGER NOT NULL DEFAULT 0,  -- number of bookmarks

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  is_deleted INTEGER DEFAULT 0,              -- soft delete flag (0 = active, 1 = deleted)
  deleted_at INTEGER                         -- deletion timestamp (UNIX epoch seconds)
);

-- Indexes for topic_posts

-- Posts by a specific author (profile feed)
-- Only non-deleted posts, sorted by newest first
CREATE INDEX IF NOT EXISTS idx_topic_posts_author_not_deleted_created_at
  ON topic_posts(author, created_at DESC)
  WHERE is_deleted = 0;

-- Posts by topic (topic feed)
-- Only non-deleted posts, sorted by newest first
CREATE INDEX IF NOT EXISTS idx_topic_posts_topic_not_deleted_created_at
  ON topic_posts(topic, created_at DESC)
  WHERE is_deleted = 0;
