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
  lastTradePrice: bigint;
  lastTradeIsBuy: 0 | 1;
  lastBlockNumber: bigint;
  lastLogIndex: number;
};

type OhlcvBucketAgg = {
  bucketStart: number;
  openPrice: bigint;
  highPrice: bigint;
  lowPrice: bigint;
  closePrice: bigint;
  volume: bigint;
  buyVolume: bigint;
  sellVolume: bigint;
  tradeCount: number;
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
 *         finalBalance > 0   → INSERT ... ON CONFLICT DO UPDATE
 *           balance, last_trade_price, last_trade_is_buy
 *
 * - For persona_fragments:
 *     - Keep only the latest trade per persona (by blockNumber + logIndex).
 *     - Upsert once per persona.
 *     - holder_count is computed inside SQL via:
 *         (SELECT COUNT(*) FROM persona_fragment_holders WHERE persona_address = ?)
 *
 * - For persona_fragment_ohlcv_1h:
 *     - Aggregate trades into 1-hour buckets per persona.
 *     - For each (persona, bucket_start), merge with existing row if present
 *       and upsert final OHLCV values.
 *
 * - All writes (trades + holders + persona snapshots + OHLCV + sync-status) are
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
    await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
    return;
  }

  // ------------------------------------------------------------------
  // 3. In-memory state for this sync run
  // ------------------------------------------------------------------

  // Block timestamp cache: blockNumber -> timestamp
  const blockTimestampCache = new Map<bigint, number>();

  // personaAddress -> (holderAddress -> HolderState)
  const personaHolderFinalState = new Map<string, Map<string, HolderState>>();

  // Per persona, latest snapshot in this batch
  const personaSnapshots = new Map<string, PersonaSnapshot>();

  // List of trade INSERT statements
  const tradeStatements: D1PreparedStatement[] = [];

  // Personas affected by trades in this batch (for persona_fragments updates)
  const affectedPersonas = new Set<string>();

  // personaAddress -> (bucketStart -> OhlcvBucketAgg)
  const ohlcvAgg = new Map<string, Map<number, OhlcvBucketAgg>>();

  // ------------------------------------------------------------------
  // 4. First pass: filter logs, track final holder balances & persona snapshots,
  //    collect trade INSERTs, and aggregate OHLCV buckets.
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

    const amountBig = amount as bigint;
    const priceBig = price as bigint;
    const isBuyBool = Boolean(isBuy);

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
        isBuyBool ? 1 : 0,
        amountBig.toString(),
        priceBig.toString(),
        (protocolFee as bigint).toString(),
        (personaFee as bigint).toString(),
        (holdingReward as bigint).toString(),
        (supply as bigint).toString(),
        (traderBalance as bigint).toString()
      )
    );

    // 4-2. Track latest holder state per (persona, trader)
    let holderMap = personaHolderFinalState.get(personaAddress);
    if (!holderMap) {
      holderMap = new Map<string, HolderState>();
      personaHolderFinalState.set(personaAddress, holderMap);
    }

    const existingHolderState = holderMap.get(traderAddress);
    const newState: HolderState = {
      finalBalance: traderBalance as bigint,
      lastTradePrice: priceBig,
      lastTradeIsBuy: isBuyBool ? 1 : 0,
      lastBlockNumber: blockNumber,
      lastLogIndex: numericLogIndex,
    };

    if (!existingHolderState) {
      holderMap.set(traderAddress, newState);
    } else if (
      blockNumber > existingHolderState.lastBlockNumber ||
      (blockNumber === existingHolderState.lastBlockNumber &&
        numericLogIndex > existingHolderState.lastLogIndex)
    ) {
      holderMap.set(traderAddress, newState);
    }

    // 4-3. Track latest persona snapshot (by blockNumber + logIndex)
    const existingSnapshot = personaSnapshots.get(personaAddress);
    const snapshotCandidate: PersonaSnapshot = {
      supplyAfter: supply as bigint,
      lastPrice: priceBig,
      lastIsBuy: isBuyBool ? 1 : 0,
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

    // 4-4. Aggregate 1-hour OHLCV buckets
    const bucketStart = Math.floor(blockTimestamp / 3600) * 3600; // 1h bucket

    let perPersonaBuckets = ohlcvAgg.get(personaAddress);
    if (!perPersonaBuckets) {
      perPersonaBuckets = new Map<number, OhlcvBucketAgg>();
      ohlcvAgg.set(personaAddress, perPersonaBuckets);
    }

    let bucket = perPersonaBuckets.get(bucketStart);
    const tradeValue = amountBig * priceBig;

    if (!bucket) {
      bucket = {
        bucketStart,
        openPrice: priceBig,
        highPrice: priceBig,
        lowPrice: priceBig,
        closePrice: priceBig,
        volume: tradeValue,
        buyVolume: isBuyBool ? tradeValue : 0n,
        sellVolume: isBuyBool ? 0n : tradeValue,
        tradeCount: 1,
      };
      perPersonaBuckets.set(bucketStart, bucket);
    } else {
      // 가격
      bucket.closePrice = priceBig;
      if (priceBig > bucket.highPrice) bucket.highPrice = priceBig;
      if (priceBig < bucket.lowPrice) bucket.lowPrice = priceBig;

      // 볼륨
      bucket.volume += tradeValue;
      if (isBuyBool) {
        bucket.buyVolume += tradeValue;
      } else {
        bucket.sellVolume += tradeValue;
      }

      bucket.tradeCount += 1;
    }
  }

  // If every log in the range was already processed (all <= lastSynced),
  // we will have no affected personas or tradeStatements.
  if (tradeStatements.length === 0 && affectedPersonas.size === 0) {
    await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
    return;
  }

  // ------------------------------------------------------------------
  // 5. Build holder mutations using ONLY final states from events
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
        // Upsert holder balance + last_trade_price + last_trade_is_buy
        holderStatements.push(
          env.DB.prepare(
            `INSERT INTO persona_fragment_holders (
               persona_address, holder_address, balance,
               last_trade_price, last_trade_is_buy
             ) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(persona_address, holder_address) DO UPDATE SET
               balance          = excluded.balance,
               last_trade_price = excluded.last_trade_price,
               last_trade_is_buy = excluded.last_trade_is_buy,
               updated_at       = strftime('%s','now')`
          ).bind(
            personaAddress,
            holderAddress,
            finalBalance.toString(),
            state.lastTradePrice.toString(),
            state.lastTradeIsBuy
          )
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
  // 7. Build OHLCV (1h) upserts for persona_fragment_ohlcv_1h
  // ------------------------------------------------------------------
  const ohlcvStatements: D1PreparedStatement[] = [];

  for (const [personaAddress, buckets] of ohlcvAgg.entries()) {
    for (const [bucketStart, agg] of buckets.entries()) {
      // 기존 버킷이 있다면 가져와서 병합
      const existing = await env.DB
        .prepare(
          `SELECT
             open_price,
             high_price,
             low_price,
             close_price,
             volume_wei,
             buy_volume_wei,
             sell_volume_wei,
             trade_count
           FROM persona_fragment_ohlcv_1h
           WHERE persona_address = ? AND bucket_start = ?`
        )
        .bind(personaAddress, bucketStart)
        .first<{
          open_price: string | null;
          high_price: string | null;
          low_price: string | null;
          close_price: string | null;
          volume_wei: string;
          buy_volume_wei: string;
          sell_volume_wei: string;
          trade_count: number;
        } | null>();

      let finalOpen = agg.openPrice;
      let finalHigh = agg.highPrice;
      let finalLow = agg.lowPrice;
      let finalClose = agg.closePrice;
      let finalVolume = agg.volume;
      let finalBuyVolume = agg.buyVolume;
      let finalSellVolume = agg.sellVolume;
      let finalTradeCount = agg.tradeCount;

      if (existing) {
        // open_price는 기존 값 유지 (시간 상 앞선 트레이드일 가능성이 높음)
        if (existing.open_price !== null) {
          finalOpen = BigInt(existing.open_price);
        }

        if (existing.high_price !== null) {
          const exHigh = BigInt(existing.high_price);
          if (exHigh > finalHigh) finalHigh = exHigh;
        }

        if (existing.low_price !== null) {
          const exLow = BigInt(existing.low_price);
          if (exLow < finalLow) finalLow = exLow;
        }

        if (existing.close_price !== null) {
          // 기존 close는 지난번 sync의 마지막 트레이드,
          // 이번 batch의 close가 더 뒤에 오므로 그대로 agg.closePrice 사용
          // (따로 비교할 필요 없이 '새로운 마지막'으로 덮어씀)
          // finalClose는 이미 agg.closePrice
        }

        finalVolume += BigInt(existing.volume_wei);
        finalBuyVolume += BigInt(existing.buy_volume_wei);
        finalSellVolume += BigInt(existing.sell_volume_wei);
        finalTradeCount += existing.trade_count;
      }

      ohlcvStatements.push(
        env.DB.prepare(
          `INSERT INTO persona_fragment_ohlcv_1h (
             persona_address,
             bucket_start,
             open_price,
             high_price,
             low_price,
             close_price,
             volume_wei,
             buy_volume_wei,
             sell_volume_wei,
             trade_count
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(persona_address, bucket_start) DO UPDATE SET
             open_price      = excluded.open_price,
             high_price      = excluded.high_price,
             low_price       = excluded.low_price,
             close_price     = excluded.close_price,
             volume_wei      = excluded.volume_wei,
             buy_volume_wei  = excluded.buy_volume_wei,
             sell_volume_wei = excluded.sell_volume_wei,
             trade_count     = excluded.trade_count`
        ).bind(
          personaAddress,
          bucketStart,
          finalOpen.toString(),
          finalHigh.toString(),
          finalLow.toString(),
          finalClose.toString(),
          finalVolume.toString(),
          finalBuyVolume.toString(),
          finalSellVolume.toString(),
          finalTradeCount
        )
      );
    }
  }

  // ------------------------------------------------------------------
  // 8. Build sync-status statement (to be included in the same batch)
  // ------------------------------------------------------------------
  const syncStatusStatement = buildSyncStatusStatement(
    env,
    CONTRACT_TYPE,
    Number(toBlock)
  );

  // ------------------------------------------------------------------
  // 9. Execute all mutations in a single batch/transaction:
  //     - trades
  //     - holder balances (incl. last_trade_price/is_buy)
  //     - persona snapshots
  //     - OHLCV 1h buckets
  //     - sync checkpoint
  // ------------------------------------------------------------------
  const statements: D1PreparedStatement[] = [
    ...tradeStatements,
    ...holderStatements,
    ...personaStatements,
    ...ohlcvStatements,
    syncStatusStatement,
  ];

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }
}
