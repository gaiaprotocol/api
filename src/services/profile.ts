import { getAddress } from "viem";
import { Profile } from "../types/profile";

export async function fetchProfileByAddress(env: Env, account: string) {
  const flatAddress = getAddress(account);

  const sql = `
    SELECT account, nickname, bio, profile_image, created_at, updated_at
    FROM profiles
    WHERE account = ? COLLATE NOCASE
    LIMIT 1
  `;

  const stmt = env.DB.prepare(sql).bind(flatAddress);
  const row = await stmt.first<Profile>();

  return row ?? undefined;
}
