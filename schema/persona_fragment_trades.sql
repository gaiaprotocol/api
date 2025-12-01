CREATE TABLE IF NOT EXISTS persona_fragment_trades (
  -- Unique event identifier (composite primary key)
  tx_hash    TEXT    NOT NULL,          -- transaction hash
  log_index  INTEGER NOT NULL,          -- log index within the transaction

  -- Block metadata
  block_number    INTEGER NOT NULL,     -- block number where the event was emitted
  block_timestamp INTEGER,              -- block timestamp (UNIX seconds, optional)

  -- Trade participants
  persona_address TEXT NOT NULL,        -- persona address
  trader_address  TEXT NOT NULL,        -- trader address
  is_buy          INTEGER NOT NULL,     -- 1 = buy, 0 = sell

  -- Financial data (stored as string to safely handle uint256)
  amount         TEXT NOT NULL,         -- number of fragments (uint256 as string)
  price          TEXT NOT NULL,         -- trade price in wei (uint256 as string)
  protocol_fee   TEXT NOT NULL,         -- protocol fee in wei (uint256 as string)
  persona_fee    TEXT NOT NULL,         -- persona owner fee in wei (uint256 as string)
  holding_reward TEXT NOT NULL,         -- holding reward in wei (uint256 as string)
  supply_after   TEXT NOT NULL,         -- total supply after this trade (uint256 as string)

  -- Local insertion timestamp
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  -- Composite primary key based on Ethereum log identity
  PRIMARY KEY (tx_hash, log_index)
);

-- Index for time-series / latest trades queries
CREATE INDEX IF NOT EXISTS idx_persona_fragment_trades_block_log
  ON persona_fragment_trades (block_number DESC, log_index DESC);

-- Index for persona + latest trades (common query pattern)
CREATE INDEX IF NOT EXISTS idx_persona_fragment_trades_persona_block_log
  ON persona_fragment_trades (persona_address, block_number DESC, log_index DESC);
