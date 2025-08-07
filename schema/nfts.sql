CREATE TABLE nfts (
  nft_address TEXT NOT NULL,
  token_id INTEGER NOT NULL,
  holder TEXT NOT NULL,
  type TEXT,
  gender TEXT,
  parts TEXT,
  image TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER,
  PRIMARY KEY (nft_address, token_id)
);

CREATE INDEX idx_nfts_holder ON nfts (holder);
