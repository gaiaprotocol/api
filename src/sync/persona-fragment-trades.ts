import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem,
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { buildSyncStatusStatement, upsertSyncStatus } from './contract-event';

// Updated ABI: includes traderBalance as the last argument
const TRADE_EXECUTED_EVENT = parseAbiItem(
  'event TradeExecuted(address indexed trader, address indexed persona, bool indexed isBuy, uint256 amount, uint256 price, uint256 protocolFee, uint256 personaFee, uint256 holdingReward, uint256 supply, uint256 traderBalance)'
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

type HolderState = {
  finalBalance: bigint;
  lastBlockNumber: bigint;
  lastLogIndex: number;
};

/**
 * Sync TradeExecuted events from the PersonaFragments contract.
 *
 * Strategy:
 * - Keep the original block range logic:
 *     const BLOCK_STEP = 500;
 *     toBlock   = lastSynced + BigInt(BLOCK_STEP);
 *     fromBlock = toBlock - BigInt(BLOCK_STEP) * 2n;
 *
 * - Only apply trades with blockNumber > lastSyncedBlockNumber
 *   to avoid double-counting when ranges overlap.
 *
 * - Insert all trades into persona_fragment_trades (PK dedup).
 *
 * - For persona_fragment_holders:
 *     - For each (persona, trader), keep only the latest event
 *       in this batch (by blockNumber + logIndex).
 *     - Use the event's traderBalance as the final balance:
 *         finalBalance == 0  → DELETE
 *         finalBalance > 0   → INSERT ... ON CONFLICT DO UPDATE balance
 *
 * - For persona_fragments:
 *     - Keep only the latest trade per persona (by blockNumber + logIndex).
 *     - Upsert once per persona.
 *     - holder_count is computed inside SQL via:
 *         (SELECT COUNT(*) FROM persona_fragment_holders WHERE persona_address = ?)
 *
 * - All writes (trades + holders + persona snapshots + sync-status) are
 *   executed in a single DB.batch() call so the whole sync is transactional.
 */
export async function syncPersonaFragmentTrades(env: Env): Promise<void> {
  const CONTRACT_TYPE = 'PERSONA_FRAGMENTS';
  const BLOCK_STEP = 500;

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

  // IMPORTANT: keep the original block range logic
  let toBlock = lastSyncedBlockNumber + BigInt(BLOCK_STEP);
  if (toBlock > currentBlock) {
    toBlock = currentBlock;
  }

  let fromBlock = toBlock - BigInt(BLOCK_STEP) * 2n;
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
    // Nothing in this range; still advance the checkpoint.
    // Use the shared helper; no need for a batch here.
    await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
    return;
  }

  // ------------------------------------------------------------------
  // 3. In-memory state for this sync run
  // ------------------------------------------------------------------

  // Block timestamp cache: blockNumber -> timestamp
  const blockTimestampCache = new Map<bigint, number>();

  // Per persona, per holder final state (only the latest event in this batch wins):
  // personaAddress -> (holderAddress -> HolderState)
  const personaHolderFinalState = new Map<string, Map<string, HolderState>>();

  // Per persona, latest snapshot in this batch
  const personaSnapshots = new Map<string, PersonaSnapshot>();

  // List of trade INSERT statements
  const tradeStatements: D1PreparedStatement[] = [];

  // Personas affected by trades in this batch (for persona_fragments updates)
  const affectedPersonas = new Set<string>();

  // ------------------------------------------------------------------
  // 4. First pass: filter logs, track final holder balances & persona snapshots,
  //    and collect trade INSERTs.
  // ------------------------------------------------------------------
  for (const log of logs) {
    const blockNumber = log.blockNumber;
    const txHash = log.transactionHash;
    const logIndex = log.logIndex;

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
      traderBalance,
    } = log.args;

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

    const numericBlock = Number(blockNumber);
    const numericLogIndex = Number(logIndex);

    // 4-1. Prepare trade history INSERT (includes trader_balance_after)
    tradeStatements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO persona_fragment_trades (
          tx_hash, log_index, block_number, block_timestamp,
          persona_address, trader_address, is_buy,
          amount, price, protocol_fee, persona_fee, holding_reward,
          supply_after, trader_balance_after
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        txHash,
        numericLogIndex,
        numericBlock,
        blockTimestamp,
        personaAddress,
        traderAddress,
        isBuy ? 1 : 0,
        (amount as bigint).toString(),
        (price as bigint).toString(),
        (protocolFee as bigint).toString(),
        (personaFee as bigint).toString(),
        (holdingReward as bigint).toString(),
        (supply as bigint).toString(),
        (traderBalance as bigint).toString()
      )
    );

    // 4-2. Track latest holder balance per (persona, trader)
    let holderMap = personaHolderFinalState.get(personaAddress);
    if (!holderMap) {
      holderMap = new Map<string, HolderState>();
      personaHolderFinalState.set(personaAddress, holderMap);
    }

    const existingHolderState = holderMap.get(traderAddress);
    const newState: HolderState = {
      finalBalance: traderBalance as bigint,
      lastBlockNumber: blockNumber,
      lastLogIndex: logIndex,
    };

    if (!existingHolderState) {
      holderMap.set(traderAddress, newState);
    } else if (
      blockNumber > existingHolderState.lastBlockNumber ||
      (blockNumber === existingHolderState.lastBlockNumber &&
        logIndex > existingHolderState.lastLogIndex)
    ) {
      holderMap.set(traderAddress, newState);
    }

    // 4-3. Track latest persona snapshot (by blockNumber + logIndex)
    const existingSnapshot = personaSnapshots.get(personaAddress);
    const snapshotCandidate: PersonaSnapshot = {
      supplyAfter: supply as bigint,
      lastPrice: price as bigint,
      lastIsBuy: isBuy ? 1 : 0,
      lastBlockNumber: numericBlock,
      lastLogIndex: numericLogIndex,
      lastTxHash: txHash,
      lastUpdatedAt: blockTimestamp,
    };

    if (!existingSnapshot) {
      personaSnapshots.set(personaAddress, snapshotCandidate);
    } else if (
      numericBlock > existingSnapshot.lastBlockNumber ||
      (numericBlock === existingSnapshot.lastBlockNumber &&
        numericLogIndex > existingSnapshot.lastLogIndex)
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
  // 5. Build holder mutations using ONLY final balances from events
  // ------------------------------------------------------------------
  const holderStatements: D1PreparedStatement[] = [];
  for (const [personaAddress, holderMap] of personaHolderFinalState.entries()) {
    for (const [holderAddress, state] of holderMap.entries()) {
      const finalBalance = state.finalBalance;

      if (finalBalance === 0n) {
        // Delete holder row if it exists (no-op if it does not)
        holderStatements.push(
          env.DB.prepare(
            `DELETE FROM persona_fragment_holders
             WHERE persona_address = ? AND holder_address = ?`
          ).bind(personaAddress, holderAddress)
        );
      } else {
        // Upsert holder balance to the final value from the event
        holderStatements.push(
          env.DB.prepare(
            `INSERT INTO persona_fragment_holders (
               persona_address, holder_address, balance
             ) VALUES (?, ?, ?)
             ON CONFLICT(persona_address, holder_address) DO UPDATE SET
               balance    = excluded.balance,
               updated_at = strftime('%s','now')`
          ).bind(personaAddress, holderAddress, finalBalance.toString())
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // 6. Build persona_fragments upserts with holder_count computed in SQL
  // ------------------------------------------------------------------
  const personaStatements: D1PreparedStatement[] = [];
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
  // 7. Build sync-status statement (to be included in the same batch)
  // ------------------------------------------------------------------
  const syncStatusStatement = buildSyncStatusStatement(
    env,
    CONTRACT_TYPE,
    Number(toBlock)
  );

  // ------------------------------------------------------------------
  // 8. Execute all mutations in a single batch/transaction:
  //     - trades
  //     - holder balances
  //     - persona snapshots
  //     - sync checkpoint
  // ------------------------------------------------------------------
  const statements: D1PreparedStatement[] = [
    ...tradeStatements,
    ...holderStatements,
    ...personaStatements,
    syncStatusStatement,
  ];

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}
