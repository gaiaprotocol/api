import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { upsertSyncStatus } from './contract-event';

const TRADE_EXECUTED_EVENT = parseAbiItem(
  'event TradeExecuted(address indexed trader, address indexed persona, bool indexed isBuy, uint256 amount, uint256 price, uint256 protocolFee, uint256 personaFee, uint256 holdingReward, uint256 supply)'
);

type PersonaSnapshot = {
  supplyAfter: bigint;
  lastPrice: bigint;
  lastIsBuy: 0 | 1;
  lastBlockNumber: number;
  lastLogIndex: number;
  lastTxHash: string;
  lastUpdatedAt: number;
};

/**
 * Sync TradeExecuted events from the PersonaFragments contract.
 *
 * Strategy:
 * - Use the existing block-range logic:
 *     toBlock   = lastSynced + BLOCK_STEP
 *     fromBlock = toBlock - BLOCK_STEP * 2
 * - But only process logs where blockNumber > lastSyncedBlockNumber
 *   to avoid double-applying trades when ranges overlap.
 * - Insert all trades into persona_fragment_trades (PK dedup).
 * - Aggregate per-holder deltas in memory.
 * - Load original balances for all holders of affected personas.
 * - Compute final balances and write only the final state:
 *     - INSERT / UPDATE / DELETE persona_fragment_holders at most once
 *       per (persona, holder).
 * - For each affected persona:
 *     - Upsert persona_fragments with:
 *         - the latest trade snapshot in this batch
 *         - holder_count computed inside the INSERT via COUNT(*)
 *           on persona_fragment_holders.
 * - Execute all writes via DB.batch() to keep things transactional.
 */
export async function syncPersonaFragmentTrades(env: Env): Promise<void> {
  const CONTRACT_TYPE = 'PERSONA_FRAGMENTS';
  const BLOCK_STEP = 500n;

  const contractAddress = getAddress(env.PERSONA_FRAGMENTS_ADDRESS);

  // ------------------------------------------------------------------
  // 1. Load last synced block
  // ------------------------------------------------------------------
  const statusRow = await env.DB.prepare(
    `SELECT last_synced_block_number FROM contract_event_sync_status WHERE contract_type = ?`
  )
    .bind(CONTRACT_TYPE)
    .first<{ last_synced_block_number: number }>();

  const client = createPublicClient({
    chain: env.ENV_TYPE === 'prod' ? base : baseSepolia,
    transport: http(),
  });

  const lastSyncedBlockNumber = statusRow
    ? BigInt(statusRow.last_synced_block_number)
    : undefined;

  if (lastSyncedBlockNumber === undefined) {
    throw new Error('No previously synced block found for PERSONA_FRAGMENTS');
  }

  const currentBlock = await client.getBlockNumber();

  // IMPORTANT: keep the original block range logic as requested.
  let toBlock = lastSyncedBlockNumber + BLOCK_STEP;
  if (toBlock > currentBlock) {
    toBlock = currentBlock;
  }

  let fromBlock = toBlock - BLOCK_STEP * 2n;
  if (fromBlock < 0n) {
    fromBlock = 0n;
  }

  // ------------------------------------------------------------------
  // 2. Fetch TradeExecuted logs (may include already-synced blocks)
  // ------------------------------------------------------------------
  const logs = await client.getLogs({
    address: contractAddress,
    event: TRADE_EXECUTED_EVENT,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) {
    // Nothing in this range; still update checkpoint to avoid re-scanning.
    await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
    return;
  }

  // ------------------------------------------------------------------
  // 3. In-memory state for this sync run
  // ------------------------------------------------------------------

  // Block timestamp cache: blockNumber -> timestamp
  const blockTimestampCache = new Map<bigint, number>();

  // Per persona, per holder net delta:
  // personaAddress -> (holderAddress -> delta)
  const personaHolderDelta = new Map<string, Map<string, bigint>>();

  // Per persona, latest snapshot in this batch
  const personaSnapshots = new Map<string, PersonaSnapshot>();

  // List of trade INSERT statements
  const tradeStatements: any[] = [];

  // Set of personas affected by trades in this batch
  const affectedPersonas = new Set<string>();

  // ------------------------------------------------------------------
  // 4. First pass: filter logs, build deltas & snapshots, collect trade inserts
  // ------------------------------------------------------------------
  for (const log of logs) {
    const blockNumber = log.blockNumber!;
    // Skip logs at or before lastSyncedBlockNumber to avoid double-processing
    if (blockNumber <= lastSyncedBlockNumber) {
      continue;
    }

    const {
      trader,
      persona,
      isBuy,
      amount,
      price,
      protocolFee,
      personaFee,
      holdingReward,
      supply,
    } = log.args;

    const txHash = log.transactionHash!;
    const logIndex = Number(log.logIndex);

    const personaAddress = getAddress(persona as string);
    const traderAddress = getAddress(trader as string);
    affectedPersonas.add(personaAddress);

    // Block timestamp (cached)
    let blockTimestamp = blockTimestampCache.get(blockNumber);
    if (blockTimestamp === undefined) {
      const block = await client.getBlock({ blockNumber });
      blockTimestamp = Number(block.timestamp);
      blockTimestampCache.set(blockNumber, blockTimestamp);
    }

    // 4-1. Prepare trade history INSERT
    tradeStatements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO persona_fragment_trades (
          tx_hash, log_index, block_number, block_timestamp,
          persona_address, trader_address, is_buy,
          amount, price, protocol_fee, persona_fee, holding_reward, supply_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash,
        logIndex,
        Number(blockNumber),
        blockTimestamp,
        personaAddress,
        traderAddress,
        isBuy ? 1 : 0,
        (amount as bigint).toString(),
        (price as bigint).toString(),
        (protocolFee as bigint).toString(),
        (personaFee as bigint).toString(),
        (holdingReward as bigint).toString(),
        (supply as bigint).toString()
      )
    );

    // 4-2. Accumulate per-holder delta for this persona
    let holderMap = personaHolderDelta.get(personaAddress);
    if (!holderMap) {
      holderMap = new Map<string, bigint>();
      personaHolderDelta.set(personaAddress, holderMap);
    }

    const prevDelta = holderMap.get(traderAddress) ?? 0n;
    const tradeAmount = amount as bigint;
    const nextDelta = isBuy ? prevDelta + tradeAmount : prevDelta - tradeAmount;
    holderMap.set(traderAddress, nextDelta);

    // 4-3. Track latest snapshot info per persona (by blockNumber + logIndex)
    const numericBlock = Number(blockNumber);
    const existing = personaSnapshots.get(personaAddress);
    const snapshotCandidate: PersonaSnapshot = {
      supplyAfter: supply as bigint,
      lastPrice: price as bigint,
      lastIsBuy: isBuy ? 1 : 0,
      lastBlockNumber: numericBlock,
      lastLogIndex: logIndex,
      lastTxHash: txHash,
      lastUpdatedAt: blockTimestamp,
    };

    if (!existing) {
      personaSnapshots.set(personaAddress, snapshotCandidate);
    } else if (
      numericBlock > existing.lastBlockNumber ||
      (numericBlock === existing.lastBlockNumber &&
        logIndex > existing.lastLogIndex)
    ) {
      personaSnapshots.set(personaAddress, snapshotCandidate);
    }
  }

  // If every log in the range was already processed (all <= lastSynced),
  // we will have no affected personas or tradeStatements.
  if (tradeStatements.length === 0 && affectedPersonas.size === 0) {
    await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
    return;
  }

  // ------------------------------------------------------------------
  // 5. Load original balances for all holders of affected personas
  // ------------------------------------------------------------------
  const holderStatements: any[] = [];
  if (affectedPersonas.size > 0) {
    const personaList = Array.from(affectedPersonas);

    // Build IN clause: persona_address IN (?, ?, ...)
    const placeholders = personaList.map(() => '?').join(', ');
    const holdersQuery = `SELECT persona_address, holder_address, balance
                          FROM persona_fragment_holders
                          WHERE persona_address IN (${placeholders})`;

    const holdersResult = await env.DB.prepare(holdersQuery)
      .bind(...personaList)
      .all<{ persona_address: string; holder_address: string; balance: string }>();

    // originalBalanceMap: personaAddress -> (holderAddress -> originalBalance)
    const originalBalanceMap = new Map<string, Map<string, bigint>>();
    for (const row of holdersResult.results ?? []) {
      let m = originalBalanceMap.get(row.persona_address);
      if (!m) {
        m = new Map<string, bigint>();
        originalBalanceMap.set(row.persona_address, m);
      }
      m.set(row.holder_address, BigInt(row.balance));
    }

    // ----------------------------------------------------------------
    // 6. Compute final balances and build minimal INSERT/UPDATE/DELETE
    // ----------------------------------------------------------------
    for (const personaAddress of affectedPersonas) {
      const deltaMap = personaHolderDelta.get(personaAddress) ?? new Map();
      const originalMap = originalBalanceMap.get(personaAddress) ?? new Map();

      // Union of holders that either had an original balance or a delta
      const allHolders = new Set<string>();
      for (const h of originalMap.keys()) allHolders.add(h);
      for (const h of deltaMap.keys()) allHolders.add(h);

      for (const holderAddress of allHolders) {
        const original = originalMap.get(holderAddress) ?? 0n;
        const delta = deltaMap.get(holderAddress) ?? 0n;
        let finalBalance = original + delta;
        if (finalBalance < 0n) finalBalance = 0n; // safety

        // No change -> skip
        if (finalBalance === original) continue;

        if (finalBalance === 0n && original > 0n) {
          // Remove holder row
          holderStatements.push(
            env.DB.prepare(
              `DELETE FROM persona_fragment_holders
               WHERE persona_address = ? AND holder_address = ?`
            ).bind(personaAddress, holderAddress)
          );
        } else if (finalBalance > 0n && original === 0n) {
          // New holder row
          holderStatements.push(
            env.DB.prepare(
              `INSERT INTO persona_fragment_holders (
                 persona_address, holder_address, balance
               ) VALUES (?, ?, ?)`
            ).bind(personaAddress, holderAddress, finalBalance.toString())
          );
        } else if (finalBalance > 0n && original > 0n) {
          // Existing holder row updated
          holderStatements.push(
            env.DB.prepare(
              `UPDATE persona_fragment_holders
               SET balance = ?, updated_at = strftime('%s','now')
               WHERE persona_address = ? AND holder_address = ?`
            ).bind(finalBalance.toString(), personaAddress, holderAddress)
          );
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // 7. Build persona_fragments upserts with holder_count computed inside SQL
  // ------------------------------------------------------------------
  const personaStatements: any[] = [];
  for (const [personaAddress, snapshot] of personaSnapshots.entries()) {
    personaStatements.push(
      env.DB.prepare(
        `INSERT INTO persona_fragments (
           persona_address,
           current_supply,
           holder_count,
           last_price,
           last_is_buy,
           last_block_number,
           last_tx_hash,
           last_updated_at
         )
         SELECT
           ? AS persona_address,
           ? AS current_supply,
           (SELECT COUNT(*) FROM persona_fragment_holders WHERE persona_address = ?) AS holder_count,
           ? AS last_price,
           ? AS last_is_buy,
           ? AS last_block_number,
           ? AS last_tx_hash,
           ? AS last_updated_at
         ON CONFLICT(persona_address) DO UPDATE SET
           current_supply    = excluded.current_supply,
           holder_count      = excluded.holder_count,
           last_price        = excluded.last_price,
           last_is_buy       = excluded.last_is_buy,
           last_block_number = excluded.last_block_number,
           last_tx_hash      = excluded.last_tx_hash,
           last_updated_at   = excluded.last_updated_at`
      ).bind(
        personaAddress,
        snapshot.supplyAfter.toString(),
        personaAddress, // used in COUNT(*)
        snapshot.lastPrice.toString(),
        snapshot.lastIsBuy,
        snapshot.lastBlockNumber,
        snapshot.lastTxHash,
        snapshot.lastUpdatedAt
      )
    );
  }

  // ------------------------------------------------------------------
  // 8. Execute all mutations in order in a single batch/transaction
  //     - trades
  //     - holder balances
  //     - persona snapshots (with COUNT(*) inside SQL)
  // ------------------------------------------------------------------
  const statements: any[] = [
    ...tradeStatements,
    ...holderStatements,
    ...personaStatements,
  ];

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  // ------------------------------------------------------------------
  // 9. Update sync checkpoint (we processed logs up to toBlock)
  // ------------------------------------------------------------------
  await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
}
