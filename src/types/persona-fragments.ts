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
