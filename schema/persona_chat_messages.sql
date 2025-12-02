-- ======================================
-- persona_chat_messages
--  - One implicit chat room per persona_address
--  - Supports replies and per-reaction aggregated counts
-- ======================================
CREATE TABLE IF NOT EXISTS persona_chat_messages (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,

  persona_address   TEXT    NOT NULL,      -- persona (one chat room per persona)
  sender            TEXT    NOT NULL,      -- wallet address
  sender_ip         TEXT,                  -- IP address at message creation

  content           TEXT    NOT NULL,      -- message content
  attachments       TEXT,                  -- JSON list of file attachments

  parent_message_id INTEGER,               -- reply target (nullable)
                                           -- references persona_chat_messages.id

  -- Aggregated reaction counts (denormalized from persona_chat_reactions)
  -- JSON object: { "heart": 3, "👍": 5, "😂": 1 }
  reaction_counts   TEXT,                  -- JSON map: reaction_type -> count

  created_at        INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  edited_at         INTEGER,
  is_deleted        INTEGER NOT NULL DEFAULT 0,
  deleted_at        INTEGER,

  FOREIGN KEY (parent_message_id) REFERENCES persona_chat_messages(id)
);

-- Timeline in a persona chat
CREATE INDEX IF NOT EXISTS idx_chat_messages_persona_created_at
  ON persona_chat_messages (persona_address, created_at DESC)
  WHERE is_deleted = 0;

-- Messages by sender
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_created_at
  ON persona_chat_messages (sender, created_at DESC)
  WHERE is_deleted = 0;
