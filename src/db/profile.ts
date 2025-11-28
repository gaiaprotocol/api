import { getAddress } from "viem";
import { rowToPersonaPost } from "../types/post";
import { Profile, ProfileRow, rowToProfile } from "../types/profile";

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
      banner_url,
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

/**
 * Fetch a profile and its posts using a wallet address.
 */
export async function getProfileWithPosts(env: Env, walletAddress: string) {
  // Fetch profile data
  const profileRow = await env.DB.prepare(
    `
    SELECT
      account,
      nickname,
      bio,
      avatar_url,
      banner_url,
      social_links,
      created_at,
      updated_at
    FROM profiles
    WHERE account = ?
    `
  )
    .bind(walletAddress)
    .first<ProfileRow | null>();

  // If the profile does not exist, return a minimal fallback profile
  const profile: Profile = profileRow
    ? rowToProfile(profileRow)
    : {
      account: walletAddress,
      nickname: null,
      bio: null,
      avatarUrl: null,
      bannerUrl: null,
      socialLinks: null,
      createdAt: null,
      updatedAt: null,
    };

  // Fetch the user's posts (latest 50 root posts)
  const postsRows = await env.DB.prepare(
    `
    SELECT
      p.*,
      pr.account,
      pr.nickname,
      pr.bio,
      pr.avatar_url,
      pr.banner_url,
      pr.social_links,
      pr.created_at AS profile_created_at,
      pr.updated_at AS profile_updated_at
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON p.author = pr.account
    WHERE p.author = ?
    ORDER BY p.created_at DESC
    LIMIT 50
    `
  )
    .bind(walletAddress)
    .all<any>();

  const posts = postsRows.results.map(rowToPersonaPost);

  return { profile, posts };
}
