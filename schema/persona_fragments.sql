CREATE TABLE IF NOT EXISTS persona_fragments (
  persona_address TEXT PRIMARY KEY,

  current_supply TEXT NOT NULL,        -- latest supply (uint256 stored as string)
  holder_count INTEGER NOT NULL,       -- number of holders

  last_price TEXT NOT NULL,            -- last traded price (wei)
  last_is_buy INTEGER NOT NULL,        -- last trade: 1=buy, 0=sell
  last_block_number INTEGER NOT NULL,
  last_tx_hash TEXT NOT NULL,
  last_updated_at INTEGER NOT NULL     -- UNIX timestamp
);

-- Index for sorting personas by last activity
CREATE INDEX IF NOT EXISTS idx_persona_fragments_last_block
  ON persona_fragments (last_block_number DESC);
