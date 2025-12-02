import { getAddress } from "viem";
import { PersonaFragments, PersonaFragmentsRow, rowToPersonaFragments } from "../../types/persona-fragments";

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
