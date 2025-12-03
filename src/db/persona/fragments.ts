import { getAddress } from "viem";
import { PersonaFragmentHolding, PersonaFragmentHoldingRow, PersonaFragments, PersonaFragmentsRow, rowToPersonaFragmentHolding, rowToPersonaFragments } from "../../types/persona-fragments";

/**
 * 지갑 주소(페르소나 주소)로 persona_fragments 조회
 */
export async function fetchPersonaFragmentsByAddress(
  env: Env,
  account: string
): Promise<PersonaFragments | null> {
  // 주소 checksum 정규화
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

export async function fetchHeldPersonaFragmentsForHolder(
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
      pf.last_updated_at
    FROM persona_fragment_holders ph
    JOIN persona_fragments pf
      ON pf.persona_address = ph.persona_address
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

