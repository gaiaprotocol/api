import { getAddress } from "viem";
import {
  PersonaFragmentHolding,
  PersonaFragmentHoldingRow,
  PersonaFragments,
  PersonaFragmentsRow,
  TrendingPersonaFragment,
  rowToPersonaFragmentHolding,
  rowToPersonaFragments,
} from "../../types/persona-fragments";

export type ExploreSortKey = 'trending' | 'holders' | 'volume' | 'price';

/**
 * Fetch persona_fragments by persona (wallet) address.
 */
export async function queryPersonaFragmentsByAddress(
  env: Env,
  account: string,
): Promise<PersonaFragments | null> {
  const flatAddress = getAddress(account);

  const sql = `
    SELECT
      persona_address,
      current_supply,
      holder_count,
      last_price,
      last_is_buy,
      last_block_number,
      last_tx_hash,
      last_updated_at
    FROM persona_fragments
    WHERE persona_address = ? COLLATE NOCASE
    LIMIT 1
  `;

  const stmt = env.DB.prepare(sql).bind(flatAddress);
  const row = await stmt.first<PersonaFragmentsRow | null>();

  if (!row) return null;

  return rowToPersonaFragments(row);
}

/**
 * Fetch all persona fragments held by a holder.
 *  - 🔥 profiles 를 LEFT JOIN 해서 persona 닉네임 + 아바타 포함
 */
export async function queryHeldPersonaFragmentsForHolder(
  env: Env,
  holderAddress: string,
): Promise<PersonaFragmentHolding[]> {
  const stmt = `
    SELECT
      ph.persona_address,
      ph.balance,
      ph.last_trade_price,
      ph.last_trade_is_buy,
      ph.updated_at       AS holder_updated_at,
      pf.current_supply,
      pf.holder_count,
      pf.last_price,
      pf.last_is_buy,
      pf.last_block_number,
      pf.last_tx_hash,
      pf.last_updated_at,
      p.nickname          AS persona_nickname,
      p.avatar_url        AS persona_avatar_url
    FROM persona_fragment_holders ph
    JOIN persona_fragments pf
      ON pf.persona_address = ph.persona_address
    LEFT JOIN profiles p
      ON p.account = ph.persona_address
    WHERE ph.holder_address = ?
      AND ph.balance != '0'
    ORDER BY pf.last_block_number DESC
  `;

  const { results } = await env.DB.prepare(stmt)
    .bind(holderAddress)
    .all<PersonaFragmentHoldingRow>();

  const rows = results ?? [];
  return rows.map(rowToPersonaFragmentHolding);
}

/**
 * 최근 활동 순으로 기본 persona 리스트 (정렬은 나중에 JS에서).
 * 너무 많아지지 않게 LIMIT 는 적당히 크게 (예: 500).
 */
async function queryPersonaFragmentsBaseForExplore(
  env: Env,
  limit: number,
): Promise<
  Array<{
    personaAddress: `0x${string}`;
    currentSupply: string;
    holderCount: number;
    lastPrice: string;
    lastBlockNumber: number;
  }>
> {
  const stmt = env.DB.prepare(
    `
    SELECT
      persona_address,
      current_supply,
      holder_count,
      last_price,
      last_block_number
    FROM persona_fragments
    ORDER BY last_block_number DESC
    LIMIT ?
    `,
  ).bind(limit);

  const { results } = await stmt.all<{
    persona_address: string;
    current_supply: string;
    holder_count: number;
    last_price: string;
    last_block_number: number;
  }>();

  return (results ?? []).map((row) => ({
    personaAddress: row.persona_address as `0x${string}`,
    currentSupply: row.current_supply,
    holderCount: row.holder_count,
    lastPrice: row.last_price,
    lastBlockNumber: row.last_block_number,
  }));
}

/**
 * 특정 persona의 "최근 24시간" OHLCV 통계 계산.
 */
export async function queryPersona24hStats(
  env: Env,
  personaAddress: string,
  currentPriceWei: string,
): Promise<{
  volume24hWei: string;
  change24hPct: number | null;
}> {
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = nowSec - 24 * 3600;

  // 1) 최근 24시간 버킷들
  const { results: buckets } = await env.DB
    .prepare(
      `
      SELECT
        bucket_start,
        open_price,
        close_price,
        volume_wei
      FROM persona_fragment_ohlcv_1h
      WHERE persona_address = ?
        AND bucket_start >= ?
        AND bucket_start <= ?
      ORDER BY bucket_start ASC
      `
    )
    .bind(personaAddress, fromSec, nowSec)
    .all<{
      bucket_start: number;
      open_price: string | null;
      close_price: string | null;
      volume_wei: string;
    }>();

  let volume24h = 0n;
  let earliestOpen: bigint | null = null;

  const rows = buckets ?? [];
  for (const row of rows) {
    volume24h += BigInt(row.volume_wei);
    if (earliestOpen === null) {
      if (row.open_price !== null) earliestOpen = BigInt(row.open_price);
      else if (row.close_price !== null) earliestOpen = BigInt(row.close_price);
    }
  }

  // 2) 24h window 이전 마지막 버킷 close
  const prevBucket = await env.DB
    .prepare(
      `
      SELECT close_price
      FROM persona_fragment_ohlcv_1h
      WHERE persona_address = ?
        AND bucket_start < ?
      ORDER BY bucket_start DESC
      LIMIT 1
      `
    )
    .bind(personaAddress, fromSec)
    .first<{ close_price: string | null } | null>();

  let basePrice: bigint | null = null;
  if (prevBucket && prevBucket.close_price !== null) {
    basePrice = BigInt(prevBucket.close_price);
  } else if (earliestOpen !== null) {
    basePrice = earliestOpen;
  }

  const currentPrice = BigInt(currentPriceWei);
  let change24hPct: number | null = null;

  if (basePrice !== null && basePrice !== 0n) {
    const diff = currentPrice - basePrice;
    const bps = (diff * 10000n) / basePrice; // basis points
    change24hPct = Number(bps) / 100;
  }

  return {
    volume24hWei: volume24h.toString(),
    change24hPct,
  };
}

/**
 * sortKey 에 따라 정렬된 트렌딩/탐색 페르소나 리스트 (24h 통계 포함).
 */
export async function queryTrendingPersonaFragments(
  env: Env,
  limit: number,
  sort: ExploreSortKey,
): Promise<TrendingPersonaFragment[]> {
  // 어느 탭이든 기본 풀은 "최근 활동 많은 순"으로 넉넉히 가져와서
  // 그 안에서 sortKey 기준으로 다시 정렬
  const baseLimit = Math.max(limit * 3, limit);
  const base = await queryPersonaFragmentsBaseForExplore(env, baseLimit);

  const withStats: TrendingPersonaFragment[] = [];

  for (const row of base) {
    const { volume24hWei, change24hPct } = await queryPersona24hStats(
      env,
      row.personaAddress,
      row.lastPrice,
    );

    withStats.push({
      personaAddress: row.personaAddress,
      name: '', // handler에서 profile nickname 주입
      currentSupply: row.currentSupply,
      holderCount: row.holderCount,
      lastPrice: row.lastPrice,
      lastBlockNumber: row.lastBlockNumber,
      volume24hWei,
      change24hPct,
    });
  }

  // sortKey 에 따라 정렬
  withStats.sort((a, b) => {
    switch (sort) {
      case 'holders':
        return b.holderCount - a.holderCount;
      case 'volume': {
        const av = BigInt(a.volume24hWei ?? '0');
        const bv = BigInt(b.volume24hWei ?? '0');
        if (av === bv) return 0;
        return bv > av ? 1 : -1;
      }
      case 'price': {
        const av = BigInt(a.lastPrice ?? '0');
        const bv = BigInt(b.lastPrice ?? '0');
        if (av === bv) return 0;
        return bv > av ? 1 : -1;
      }
      case 'trending':
      default: {
        const av =
          a.change24hPct === null || Number.isNaN(a.change24hPct)
            ? -Infinity
            : a.change24hPct;
        const bv =
          b.change24hPct === null || Number.isNaN(b.change24hPct)
            ? -Infinity
            : b.change24hPct;
        if (bv === av) {
          // 동률이면 최근 활동 순
          return b.lastBlockNumber - a.lastBlockNumber;
        }
        return bv - av;
      }
    }
  });

  return withStats.slice(0, limit);
}
