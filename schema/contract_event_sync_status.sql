CREATE TABLE contract_event_sync_status (
  contract_type TEXT NOT NULL PRIMARY KEY,
  last_synced_block_number INTEGER NOT NULL,
  last_synced_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
