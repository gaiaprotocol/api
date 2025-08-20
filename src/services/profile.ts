import { getAddress } from "viem";
import { Profile } from "../types/profile";

type ProfileRow = {
  account: string;
  nickname: string | null;
  bio: string | null;
  profile_image?: string | null; // 이미지 URL/경로 (nullable)
  created_at: number;            // UNIX seconds
  updated_at: number | null;     // UNIX seconds (nullable)
};

function rowToProfile(row: ProfileRow): Profile {
  return {
    account: row.account,
    nickname: row.nickname ?? undefined,
    bio: row.bio ?? undefined,
    profileImage: row.profile_image ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

export async function fetchProfileByAddress(env: Env, account: string) {
  const flatAddress = getAddress(account);

  const sql = `
    SELECT account, nickname, bio, profile_image, created_at, updated_at
    FROM profiles
    WHERE account = ? COLLATE NOCASE
    LIMIT 1
  `;

  const stmt = env.DB.prepare(sql).bind(flatAddress);
  const row = await stmt.first<ProfileRow>();

  return row ? rowToProfile(row) : undefined;
}
