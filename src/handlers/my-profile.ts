import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';

const TABLE_NAME = 'profiles';

export async function handleMyProfile(request: Request, env: Env) {
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

    // 2) Single profile lookup by account
    const stmt = `
      SELECT
        account,
        nickname,
        bio,
        avatar_url,
        banner_url,
        social_links,
        created_at,
        updated_at
      FROM ${TABLE_NAME}
      WHERE account = ?
    `;
    const row = await env.DB.prepare(stmt).bind(account).first();

    if (!row) {
      // Keep existing behavior: 404 when profile row does not exist
      return jsonWithCors(
        { error: 'Profile not found for this account.' },
        404,
      );
    }

    // 3) Normalize timestamps (SQLite/D1 may return INTEGER as string)
    const createdAtRaw =
      typeof row.created_at === 'number' ? row.created_at : Number(row.created_at);

    const updatedAtRaw =
      row.updated_at == null
        ? null
        : (typeof row.updated_at === 'number'
          ? row.updated_at
          : Number(row.updated_at));

    const createdAt = Number.isFinite(createdAtRaw) ? createdAtRaw : null;
    const updatedAt =
      updatedAtRaw == null || !Number.isFinite(updatedAtRaw) ? null : updatedAtRaw;

    // 4) Parse social_links JSON (DB → camelCase socialLinks)
    let socialLinks: Record<string, string> | null = null;
    if (row.social_links != null) {
      try {
        const parsed = JSON.parse(row.social_links as string);
        if (parsed && typeof parsed === 'object') {
          socialLinks = parsed as Record<string, string>;
        }
      } catch {
        // If JSON is invalid, ignore and treat as null
        socialLinks = null;
      }
    }

    // 5) Return camelCase response expected by the client
    return jsonWithCors({
      account: row.account,
      nickname: row.nickname ?? null,
      bio: row.bio ?? null,
      avatarUrl: row.avatar_url ?? null,
      bannerUrl: row.banner_url ?? null,
      socialLinks,
      createdAt,
      updatedAt,
    });
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
