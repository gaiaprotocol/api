/**
 * Update or insert the latest synced block number for a contract type.
 */
export async function upsertSyncStatus(
  env: Env,
  contractType: string,
  lastSyncedBlockNumber: number
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO contract_event_sync_status (
       contract_type,
       last_synced_block_number,
       last_synced_at
     ) VALUES (?, ?, strftime('%s','now'))
     ON CONFLICT(contract_type) DO UPDATE SET
       last_synced_block_number = excluded.last_synced_block_number,
       last_synced_at           = excluded.last_synced_at`
  )
    .bind(contractType, lastSyncedBlockNumber)
    .run();
}
