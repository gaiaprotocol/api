/**
 * Build a prepared statement that upserts the latest synced block number
 * for a given contract type.
 *
 * This is useful when you want to include the sync-status write
 * into a larger DB.batch transaction.
 */
export function buildSyncStatusStatement(
  env: Env,
  contractType: string,
  lastSyncedBlockNumber: number
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO contract_event_sync_status (
       contract_type,
       last_synced_block_number,
       last_synced_at
     )
     VALUES (?, ?, strftime('%s','now'))
     ON CONFLICT(contract_type) DO UPDATE SET
       last_synced_block_number = excluded.last_synced_block_number,
       last_synced_at           = excluded.last_synced_at`
  ).bind(contractType, lastSyncedBlockNumber);
}

/**
 * Update or insert the latest synced block number for a contract type.
 *
 * This is a convenience wrapper around buildSyncStatusStatement
 * that runs the statement immediately (no batching).
 */
export async function upsertSyncStatus(
  env: Env,
  contractType: string,
  lastSyncedBlockNumber: number
): Promise<void> {
  const stmt = buildSyncStatusStatement(env, contractType, lastSyncedBlockNumber);
  await stmt.run();
}
