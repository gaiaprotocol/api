import { getAddress } from "viem";
import { ProfileRow, rowToProfile } from "../types/profile";

/**
 * Fetch a single profile using a wallet address.
 */
export async function fetchProfileByAddress(env: Env, account: string) {
  const flatAddress = getAddress(account);

  const sql = `
    SELECT
      account,
      nickname,
      bio,
      avatar_url,
      avatar_thumbnail_url,
      banner_url,
      banner_thumbnail_url,
      social_links,
      created_at,
      updated_at
    FROM profiles
    WHERE account = ? COLLATE NOCASE
    LIMIT 1
  `;

  const stmt = env.DB.prepare(sql).bind(flatAddress);
  const row = await stmt.first<ProfileRow>();

  return row ? rowToProfile(row) : undefined;
}
