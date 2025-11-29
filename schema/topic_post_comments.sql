-- ======================================
-- topic_post_comments
-- ======================================
CREATE TABLE topic_post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,                  -- FK to topic_posts.id
  parent_comment_id INTEGER,                 -- parent comment ID (for replies)
  author TEXT NOT NULL,                      -- wallet address

  content TEXT NOT NULL,
  attachments TEXT,                          -- JSON list of attached files

  -- Aggregated counters
  upvote_count    INTEGER NOT NULL DEFAULT 0,  -- upvotes on this comment
  downvote_count  INTEGER NOT NULL DEFAULT 0,  -- downvotes on this comment
  comment_count   INTEGER NOT NULL DEFAULT 0,  -- number of direct child comments (replies)
  bookmark_count  INTEGER NOT NULL DEFAULT 0,  -- number of bookmarks on this comment

  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  is_deleted INTEGER DEFAULT 0,              -- soft delete flag
  deleted_at INTEGER,                        -- deletion timestamp

  FOREIGN KEY (post_id) REFERENCES topic_posts(id),
  FOREIGN KEY (parent_comment_id) REFERENCES topic_post_comments(id)
);

-- Indexes for topic_post_comments

-- Comments by a specific author (non-deleted)
CREATE INDEX IF NOT EXISTS idx_topic_post_comments_author_not_deleted_created_at
  ON topic_post_comments(author, created_at DESC)
  WHERE is_deleted = 0;

-- Comments of a post (non-deleted), sorted by creation time
CREATE INDEX IF NOT EXISTS idx_topic_post_comments_post_id_not_deleted_created_at
  ON topic_post_comments(post_id, created_at)
  WHERE is_deleted = 0;

-- Replies under a specific parent comment (non-deleted)
CREATE INDEX IF NOT EXISTS idx_topic_post_comments_parent_not_deleted_created_at
  ON topic_post_comments(parent_comment_id, created_at)
  WHERE is_deleted = 0;
