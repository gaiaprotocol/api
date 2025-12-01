CREATE TABLE IF NOT EXISTS contract_event_sync_status (
  contract_type TEXT NOT NULL PRIMARY KEY,        -- e.g., 'ERC721', 'PERSONA_FRAGMENTS'
  last_synced_block_number INTEGER NOT NULL,      -- last synced block number
  last_synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now')) -- UNIX timestamp
);
