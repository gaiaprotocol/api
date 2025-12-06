// -----------------------------
// 기본 persona_fragments 타입
// -----------------------------

/**
 * DB row 타입 (컬럼명 그대로)
 */
export interface PersonaFragmentsRow {
  persona_address: string;

  current_supply: string;
  holder_count: number;

  last_price: string;
  last_is_buy: number;
  last_block_number: number;
  last_tx_hash: string;
  last_updated_at: number;
}

/**
 * 앱에서 사용할 도메인 타입 (camelCase)
 */
export interface PersonaFragments {
  personaAddress: string;

  currentSupply: string;
  holderCount: number;

  lastPrice: string;
  lastIsBuy: boolean;
  lastBlockNumber: number;
  lastTxHash: string;
  lastUpdatedAt: number;
}

/**
 * Row → 도메인 객체 변환
 */
export function rowToPersonaFragments(
  row: PersonaFragmentsRow,
): PersonaFragments {
  return {
    personaAddress: row.persona_address,

    currentSupply: row.current_supply,
    holderCount: row.holder_count,

    lastPrice: row.last_price,
    lastIsBuy: row.last_is_buy === 1,
    lastBlockNumber: row.last_block_number,
    lastTxHash: row.last_tx_hash,
    lastUpdatedAt: row.last_updated_at,
  };
}

// -----------------------------
// holdings (내가 가진 조각들)
// -----------------------------

export type PersonaFragmentHolding = PersonaFragments & {
  balance: string;
  lastTradePrice: string | null;
  lastTradeIsBuy: 0 | 1 | null;
  holderUpdatedAt: number;

  /** 🔥 프로필 닉네임 + 아바타 (profiles 테이블에서 join) */
  name: string | null;
  avatarUrl: string | null;
};

/**
 * holdings용 DB row 타입
 * persona_fragments JOIN persona_fragment_holders + profiles 에서 나오는 형태
 */
export interface PersonaFragmentHoldingRow extends PersonaFragmentsRow {
  balance: string;
  last_trade_price: string | null;
  last_trade_is_buy: 0 | 1 | null;
  holder_updated_at: number;

  // profiles 조인 결과
  persona_nickname: string | null;
  persona_avatar_url: string | null;
}

/**
 * holdings row → 도메인 객체 변환
 */
export function rowToPersonaFragmentHolding(
  row: PersonaFragmentHoldingRow,
): PersonaFragmentHolding {
  const fragments: PersonaFragments = rowToPersonaFragments(row);

  return {
    ...fragments,
    balance: row.balance,
    lastTradePrice: row.last_trade_price,
    lastTradeIsBuy: row.last_trade_is_buy,
    holderUpdatedAt: row.holder_updated_at,

    // 🔥 nickname이 있으면 그걸, 없으면 주소를 name으로
    name: row.persona_nickname ?? row.persona_address,
    avatarUrl: row.persona_avatar_url,
  };
}

// -----------------------------
// 트렌딩 / explore용 타입
// -----------------------------

export type TrendingPersonaFragment = {
  personaAddress: `0x${string}`;
  name: string;                // handler에서 profile nickname or address 주입
  currentSupply: string;
  holderCount: number;
  lastPrice: string;
  lastBlockNumber: number;

  // 새로 추가된 필드들
  volume24hWei: string;        // 24h volume in wei (string)
  change24hPct: number | null; // 24h price change in percent (e.g. 12.34)
};

export interface TrendingPersonaFragmentsResponse {
  personas: TrendingPersonaFragment[];
}
