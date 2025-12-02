-- ======================================
-- persona_chat_reactions
--  - Emoji / heart reactions to messages
--  - One row per: (message_id, reactor, reaction_type)
-- ======================================
CREATE TABLE IF NOT EXISTS persona_chat_reactions (
  message_id     INTEGER NOT NULL,      -- target message
  reactor        TEXT    NOT NULL,      -- wallet address
  reaction_type  TEXT    NOT NULL,      -- emoji string, e.g. 'heart', '👍', '😂'

  created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (message_id, reactor, reaction_type),
  FOREIGN KEY (message_id) REFERENCES persona_chat_messages(id)
);

-- Fast lookup: reactions of a specific type on a specific message
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message_type
  ON persona_chat_reactions (message_id, reaction_type);
