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
  row: PersonaFragmentsRow
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

export type PersonaFragmentHolding = PersonaFragments & {
  balance: string;
  lastTradePrice: string | null;
  lastTradeIsBuy: 0 | 1 | null;
  holderUpdatedAt: number;
};

/**
 * holdings용 DB row 타입
 * (persona_fragments JOIN persona_fragment_holders 등에서 나오는 형태라고 가정)
 */
export interface PersonaFragmentHoldingRow extends PersonaFragmentsRow {
  balance: string;
  last_trade_price: string | null;
  last_trade_is_buy: 0 | 1 | null;
  holder_updated_at: number;
}

export function rowToPersonaFragmentHolding(
  row: PersonaFragmentHoldingRow,
): PersonaFragmentHolding {
  // 공통 fragments 부분은 기존 rowToPersonaFragments 재사용
  const fragments: PersonaFragments = rowToPersonaFragments(row);

  return {
    ...fragments,
    balance: row.balance,
    lastTradePrice: row.last_trade_price,
    lastTradeIsBuy: row.last_trade_is_buy,
    holderUpdatedAt: row.holder_updated_at,
  };
}

export interface TrendingPersonaFragment {
  personaAddress: string;     // 0x...
  name: string;               // profile nickname or shortened address
  currentSupply: string;      // uint256 as string
  holderCount: number;
  lastPrice: string;          // wei as string
  lastBlockNumber: number;
}

export interface TrendingPersonaFragmentsResponse {
  personas: TrendingPersonaFragment[];
}
