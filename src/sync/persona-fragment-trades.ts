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

/**
 * Sync TradeExecuted events from the PersonaFragments contract.
 *
 * Responsibilities:
 * - Scan logs in the block range.
 * - Insert trade history into persona_fragment_trades.
 * - Update per-holder balances (persona_fragment_holders).
 * - Maintain holder_count incrementally (no full COUNT(*)).
 * - Update latest persona snapshot (persona_fragments).
 * - Update sync status (contract_event_sync_status).
 *
 * All writes are accumulated and executed in a single DB.batch(),
 * so the whole sync runs in one transaction.
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

  let toBlock = lastSyncedBlockNumber + BigInt(BLOCK_STEP);
  const currentBlock = await client.getBlockNumber();
  if (toBlock > currentBlock) toBlock = currentBlock;

  let fromBlock = toBlock - BigInt(BLOCK_STEP) * 2n;
  if (fromBlock < 0n) fromBlock = 0n;

  // ------------------------------------------------------------------
  // 2. Fetch TradeExecuted logs
  // ------------------------------------------------------------------
  const logs = await client.getLogs({
    address: contractAddress,
    event: TRADE_EXECUTED_EVENT,
    fromBlock,
    toBlock,
  });

  if (logs.length === 0) {
    // Nothing to sync; still update checkpoint to avoid re-scanning
    await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
    return;
  }

  // ------------------------------------------------------------------
  // 3. Local in-memory caches to minimize DB reads
  // ------------------------------------------------------------------

  // Block timestamp cache: blockNumber -> timestamp
  const blockTimestampCache = new Map<bigint, number>();

  // Holder balance cache: `${personaAddress}:${holderAddress}` -> bigint balance
  const holderBalanceCache = new Map<string, bigint>();

  // Persona holder_count cache: personaAddress -> number
  const personaHolderCountCache = new Map<string, number>();

  // All write statements collected here (executed once via DB.batch)
  const statements: D1PreparedStatement[] = [];

  for (const log of logs) {
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

    const blockNumber = log.blockNumber!;
    const txHash = log.transactionHash!;
    const logIndex = Number(log.logIndex);

    const personaAddress = getAddress(persona as string);
    const traderAddress = getAddress(trader as string);

    // ----------------------------------------------------------------
    // 3-1. Block timestamp (cached)
    // ----------------------------------------------------------------
    let blockTimestamp = blockTimestampCache.get(blockNumber);
    if (blockTimestamp === undefined) {
      const block = await client.getBlock({ blockNumber });
      blockTimestamp = Number(block.timestamp);
      blockTimestampCache.set(blockNumber, blockTimestamp);
    }

    // ----------------------------------------------------------------
    // 4. INSERT trade into persona_fragment_trades (deduped by PK)
    // ----------------------------------------------------------------
    statements.push(
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

    // ----------------------------------------------------------------
    // 5. Update holder balance in persona_fragment_holders
    //    and compute holder_count delta based on prev/new balance.
    // ----------------------------------------------------------------
    const balanceKey = `${personaAddress}:${traderAddress}`;

    // Load prevBalance once per (persona, holder) in this sync run.
    let prevBalance = holderBalanceCache.get(balanceKey);
    if (prevBalance === undefined) {
      const holderRow = await env.DB.prepare(
        `SELECT balance FROM persona_fragment_holders
         WHERE persona_address = ? AND holder_address = ?`
      )
        .bind(personaAddress, traderAddress)
        .first<{ balance: string }>();

      prevBalance = holderRow ? BigInt(holderRow.balance) : 0n;
      holderBalanceCache.set(balanceKey, prevBalance);
    }

    const tradeAmount = amount as bigint;
    let newBalance: bigint;
    if (isBuy) {
      newBalance = prevBalance + tradeAmount;
    } else {
      newBalance = prevBalance - tradeAmount;
      if (newBalance < 0n) newBalance = 0n; // safety guard
    }

    holderBalanceCache.set(balanceKey, newBalance);

    // Determine holder_count delta for this persona
    //  - prev=0 && new>0 -> gained a holder (+1)
    //  - prev>0 && new=0 -> lost a holder  (-1)
    let delta = 0;
    if (prevBalance === 0n && newBalance > 0n) {
      delta = 1;
    } else if (prevBalance > 0n && newBalance === 0n) {
      delta = -1;
    }

    // Apply balance mutation to persona_fragment_holders
    if (newBalance === 0n) {
      // Remove holder row if balance becomes zero
      statements.push(
        env.DB.prepare(
          `DELETE FROM persona_fragment_holders
           WHERE persona_address = ? AND holder_address = ?`
        ).bind(personaAddress, traderAddress)
      );
    } else {
      // Upsert holder balance
      statements.push(
        env.DB.prepare(
          `INSERT INTO persona_fragment_holders (
             persona_address, holder_address, balance
           ) VALUES (?, ?, ?)
           ON CONFLICT(persona_address, holder_address) DO UPDATE SET
             balance    = excluded.balance,
             updated_at = strftime('%s','now')`
        ).bind(
          personaAddress,
          traderAddress,
          newBalance.toString()
        )
      );
    }

    // ----------------------------------------------------------------
    // 6. Maintain holder_count and persona snapshot in persona_fragments
    // ----------------------------------------------------------------
    let holderCount = personaHolderCountCache.get(personaAddress);
    if (holderCount === undefined) {
      const row = await env.DB.prepare(
        `SELECT holder_count FROM persona_fragments WHERE persona_address = ?`
      )
        .bind(personaAddress)
        .first<{ holder_count: number }>();

      holderCount = row ? row.holder_count : 0;
    }

    holderCount += delta;
    if (holderCount < 0) holderCount = 0; // safety guard
    personaHolderCountCache.set(personaAddress, holderCount);

    // Upsert latest snapshot for this persona
    statements.push(
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
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        (supply as bigint).toString(),
        holderCount,
        (price as bigint).toString(),
        isBuy ? 1 : 0,
        Number(blockNumber),
        txHash,
        blockTimestamp
      )
    );
  }

  // ------------------------------------------------------------------
  // 7. Execute all accumulated writes in a single batch (single txn)
  // ------------------------------------------------------------------
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  // ------------------------------------------------------------------
  // 8. Update sync checkpoint
  // ------------------------------------------------------------------
  await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
}
