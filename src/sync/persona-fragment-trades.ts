import {
  createPublicClient,
  getAddress,
  http,
  parseAbiItem
} from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { upsertSyncStatus } from './contract-event';

const TRADE_EXECUTED_EVENT = parseAbiItem('event TradeExecuted(address indexed trader, address indexed persona, bool indexed isBuy, uint256 amount, uint256 price, uint256 protocolFee, uint256 personaFee, uint256 holdingReward, uint256 supply)');

/**
 * Sync TradeExecuted events from the PersonaFragments contract.
 *
 * Responsibilities:
 * - Scan logs in the block range.
 * - Insert trade history into persona_fragment_trades.
 * - Update latest per-persona snapshot (persona_fragments table).
 * - Update sync status (contract_event_sync_status).
 */
export async function syncPersonaFragmentTrades(env: Env): Promise<void> {
  const CONTRACT_TYPE = 'PERSONA_FRAGMENTS';
  const BLOCK_STEP = 500;

  const contractAddress = getAddress(env.PERSONA_FRAGMENTS_ADDRESS);

  // Load last synced block
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

  if (toBlock > currentBlock) {
    toBlock = currentBlock;
  }

  let fromBlock = toBlock - BigInt(BLOCK_STEP) * 2n;
  if (fromBlock < 0n) {
    fromBlock = 0n;
  }

  // Fetch TradeExecuted logs
  const logs = await client.getLogs({
    address: contractAddress,
    event: TRADE_EXECUTED_EVENT,
    fromBlock,
    toBlock,
  });

  // Cache to avoid repeated block lookups
  const blockTimestampCache = new Map<bigint, number>();

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

    // Fetch block timestamp (cached)
    let blockTimestamp = blockTimestampCache.get(blockNumber);
    if (blockTimestamp === undefined) {
      const block = await client.getBlock({ blockNumber });
      blockTimestamp = Number(block.timestamp);
      blockTimestampCache.set(blockNumber, blockTimestamp);
    }

    // Insert trade log (deduplicated by tx_hash + log_index)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO persona_fragment_trades (
        tx_hash, log_index, block_number, block_timestamp,
        persona_address, trader_address, is_buy,
        amount, price, protocol_fee, persona_fee, holding_reward, supply_after
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        txHash,
        logIndex,
        Number(blockNumber),
        blockTimestamp,
        getAddress(persona as string),
        getAddress(trader as string),
        isBuy ? 1 : 0,
        (amount as bigint).toString(),
        (price as bigint).toString(),
        (protocolFee as bigint).toString(),
        (personaFee as bigint).toString(),
        (holdingReward as bigint).toString(),
        (supply as bigint).toString()
      )
      .run();

    // Upsert the latest persona snapshot
    await env.DB.prepare(
      `INSERT INTO persona_fragments (
         persona_address,
         current_supply,
         last_price,
         last_is_buy,
         last_block_number,
         last_tx_hash,
         last_updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(persona_address) DO UPDATE SET
         current_supply    = excluded.current_supply,
         last_price        = excluded.last_price,
         last_is_buy       = excluded.last_is_buy,
         last_block_number = excluded.last_block_number,
         last_tx_hash      = excluded.last_tx_hash,
         last_updated_at   = excluded.last_updated_at`
    )
      .bind(
        getAddress(persona as string),
        (supply as bigint).toString(),
        (price as bigint).toString(),
        isBuy ? 1 : 0,
        Number(blockNumber),
        txHash,
        blockTimestamp
      )
      .run();
  }

  // Update syncing checkpoint
  await upsertSyncStatus(env, CONTRACT_TYPE, Number(toBlock));
}
