CREATE TABLE IF NOT EXISTS persona_fragment_holders (
  persona_address TEXT NOT NULL,
  holder_address  TEXT NOT NULL,
  balance         TEXT NOT NULL,     -- uint256 stored as string
  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (persona_address, holder_address)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_persona_fragment_holders_holder
  ON persona_fragment_holders (holder_address);
