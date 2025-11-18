CREATE TABLE IF NOT EXISTS oauth2_web3_accounts (
  provider TEXT NOT NULL,
  sub TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  token TEXT NOT NULL,
  email TEXT,
  name TEXT,
  picture TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (provider, sub)
);
