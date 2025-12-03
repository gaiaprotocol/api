CREATE TABLE IF NOT EXISTS persona_fragment_holders (
  persona_address TEXT NOT NULL,
  holder_address  TEXT NOT NULL,

  balance         TEXT NOT NULL,        -- current fragment balance (uint256 as string)

  -- Cached holder-level trade information
  last_trade_price TEXT,                -- last executed trade price (wei)
  last_trade_is_buy INTEGER,            -- last trade direction: 1=buy, 0=sell

  updated_at      INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (persona_address, holder_address)
);

-- Index for quickly searching all personas held by a specific user
CREATE INDEX IF NOT EXISTS idx_persona_fragment_holders_holder
  ON persona_fragment_holders (holder_address);
