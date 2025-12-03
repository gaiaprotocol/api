import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z, ZodError } from 'zod';

const PROFILE_TABLE = 'profiles';
const MAX_NICKNAME_LEN = 50;
const MAX_BIO_LEN = 1000;
const MAX_URL_LEN = 2048;

// Nickname validation matching server rules
function isValidNickname(nickname: string): boolean {
  if (!nickname) return false;
  if (nickname !== nickname.normalize('NFC')) return false;
  if (nickname.length > MAX_NICKNAME_LEN) return false;
  if (/^\s|\s$/.test(nickname)) return false; // No leading/trailing whitespace
  if (/\s{2,}/.test(nickname)) return false;  // No consecutive spaces
  const re = /^[\p{L}\p{N}\s._-]+$/u;        // Unicode letters/numbers/spaces/._-
  return re.test(nickname);
}

// Simple validation for social links (key-value URL map)
const SocialLinksSchema = z.record(
  z.string(),
  z
    .string()
    .trim()
    .url('socialLinks must contain valid URLs.')
    .max(MAX_URL_LEN, `Social link URL exceeds maximum length of ${MAX_URL_LEN}.`),
);

// API uses camelCase fields
const SetProfileSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .min(1, 'nickname is empty')
      .max(MAX_NICKNAME_LEN, `Nickname exceeds maximum length of ${MAX_NICKNAME_LEN}.`)
      .optional(),

    bio: z
      .string()
      .trim()
      .max(MAX_BIO_LEN, `Bio exceeds maximum length of ${MAX_BIO_LEN}.`)
      .optional(),

    avatarUrl: z
      .string()
      .trim()
      .url('avatarUrl must be a valid URL.')
      .max(MAX_URL_LEN, `avatarUrl URL exceeds maximum length of ${MAX_URL_LEN}.`)
      .optional(),

    bannerUrl: z
      .string()
      .trim()
      .url('bannerUrl must be a valid URL.')
      .max(MAX_URL_LEN, `bannerUrl URL exceeds maximum length of ${MAX_URL_LEN}.`)
      .optional(),

    socialLinks: SocialLinksSchema.optional(),
  })
  .refine(
    (v) =>
      v.nickname !== undefined ||
      v.bio !== undefined ||
      v.avatarUrl !== undefined ||
      v.bannerUrl !== undefined ||
      v.socialLinks !== undefined,
    {
      message:
        'At least one of nickname, bio, avatarUrl, bannerUrl, or socialLinks must be provided.',
    },
  );

export async function handleSetProfile(request: Request, env: Env) {
  try {
    // 1) Authorization check
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    let payload: any;

    try {
      payload = await verifyToken(token, env);
    } catch {
      return jsonWithCors(
        { error: 'Invalid or expired token. Please log in again.' },
        401,
      );
    }

    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    const account = payload.sub as string;

    // 2) Parse request body
    const body = await request.json().catch(() => ({}));

    let parsed: z.infer<typeof SetProfileSchema>;
    try {
      parsed = SetProfileSchema.parse(body);
    } catch (err) {
      if (err instanceof ZodError) {
        const message =
          err.errors[0]?.message ??
          'Invalid request body. Please check the profile fields.';
        return jsonWithCors({ error: message }, 400);
      }
      throw err;
    }

    // 3) Additional manual validation rules

    if (parsed.nickname !== undefined && !isValidNickname(parsed.nickname)) {
      return jsonWithCors(
        { error: 'The provided nickname contains invalid characters or format.' },
        400,
      );
    }

    if (parsed.bio !== undefined && parsed.bio !== parsed.bio.normalize('NFC')) {
      return jsonWithCors(
        { error: 'The provided bio has invalid normalization (NFC required).' },
        400,
      );
    }

    if (parsed.avatarUrl !== undefined) {
      if (!/^https?:\/\//i.test(parsed.avatarUrl)) {
        return jsonWithCors(
          { error: 'Only http(s) URLs are allowed for avatarUrl.' },
          400,
        );
      }
    }

    if (parsed.bannerUrl !== undefined) {
      if (!/^https?:\/\//i.test(parsed.bannerUrl)) {
        return jsonWithCors(
          { error: 'Only http(s) URLs are allowed for bannerUrl.' },
          400,
        );
      }
    }

    if (parsed.socialLinks !== undefined) {
      for (const [key, url] of Object.entries(parsed.socialLinks)) {
        if (!/^https?:\/\//i.test(url)) {
          return jsonWithCors(
            { error: `Only http(s) URLs are allowed for social link "${key}".` },
            400,
          );
        }
      }
    }

    // Prepare DB values (convert camelCase → snake_case)
    const nickname = parsed.nickname ?? null;
    const bio = parsed.bio ?? null;
    const avatarUrl = parsed.avatarUrl ?? null;
    const bannerUrl = parsed.bannerUrl ?? null;
    const socialLinks =
      parsed.socialLinks !== undefined ? JSON.stringify(parsed.socialLinks) : null;

    // 4) UPSERT into SQLite (Cloudflare D1)
    // Existing fields remain unchanged when the API does not send them
    await env.DB.prepare(
      `
      INSERT INTO ${PROFILE_TABLE}
        (account, nickname, bio, avatar_url, banner_url, social_links)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(account) DO UPDATE SET
        nickname      = COALESCE(excluded.nickname, ${PROFILE_TABLE}.nickname),
        bio           = COALESCE(excluded.bio, ${PROFILE_TABLE}.bio),
        avatar_url    = COALESCE(excluded.avatar_url, ${PROFILE_TABLE}.avatar_url),
        banner_url    = COALESCE(excluded.banner_url, ${PROFILE_TABLE}.banner_url),
        social_links  = COALESCE(excluded.social_links, ${PROFILE_TABLE}.social_links),
        updated_at    = strftime('%s','now')
      `,
    )
      .bind(account, nickname, bio, avatarUrl, bannerUrl, socialLinks)
      .run();

    return jsonWithCors({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
