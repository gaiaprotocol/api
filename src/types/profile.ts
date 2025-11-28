export type SocialLinks = Record<string, string>;

export interface Profile {
  account: string;
  nickname: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;

  // DB: string | null (JSON), Domain: parsed object
  socialLinks: SocialLinks | null;

  createdAt: number | null; // Unix timestamp (seconds)
  updatedAt: number | null;
}

export type ProfileRow = {
  account: string;
  nickname: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  social_links: string | null; // JSON string
  created_at: number;
  updated_at: number | null;
};

export function rowToProfile(row: ProfileRow): Profile {
  let socialLinks: SocialLinks | null = null;

  if (row.social_links) {
    try {
      socialLinks = JSON.parse(row.social_links);
    } catch (err) {
      console.error("Failed to parse profile.social_links", err);
      socialLinks = null;
    }
  }

  return {
    account: row.account,
    nickname: row.nickname,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    bannerUrl: row.banner_url,
    socialLinks,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
