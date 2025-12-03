import { jsonWithCors } from '@gaiaprotocol/worker-common'

const TABLE_NAME = 'profiles'

export async function handleGetProfile(request: Request, env: Env) {
  try {
    // 1) Extract account from query parameters
    const url = new URL(request.url)
    const account = url.searchParams.get('account')

    if (!account) {
      return jsonWithCors({ error: 'Missing account parameter.' }, 400)
    }

    // 2) Fetch profile row from DB
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
    `
    const row = await env.DB.prepare(stmt).bind(account).first()

    if (!row) {
      return jsonWithCors({ error: 'Profile not found for this account.' }, 404)
    }

    // 3) Normalize timestamps (stored as epoch seconds)
    const createdAt =
      typeof row.created_at === 'number' ? row.created_at : Number(row.created_at)

    const rawUpdatedAt =
      row.updated_at == null
        ? null
        : (typeof row.updated_at === 'number' ? row.updated_at : Number(row.updated_at))

    const updatedAt =
      rawUpdatedAt == null || !Number.isFinite(rawUpdatedAt) ? null : rawUpdatedAt

    const normalizedCreatedAt =
      Number.isFinite(createdAt) ? createdAt : null

    // 4) Parse social_links JSON (if present)
    let socialLinks: Record<string, string> | null = null
    if (row.social_links != null) {
      try {
        const parsed = JSON.parse(row.social_links as string)
        if (parsed && typeof parsed === 'object') {
          socialLinks = parsed as Record<string, string>
        }
      } catch {
        // If parsing fails, we just treat it as null instead of failing the whole request
        socialLinks = null
      }
    }

    // 5) Return profile in camelCase shape expected by the client
    return jsonWithCors({
      account: row.account,
      nickname: row.nickname ?? null,
      bio: row.bio ?? null,
      avatarUrl: row.avatar_url ?? null,
      bannerUrl: row.banner_url ?? null,
      socialLinks,
      createdAt: normalizedCreatedAt,
      updatedAt,
    })
  } catch (err) {
    console.error(err)
    return jsonWithCors({ error: 'Internal server error.' }, 500)
  }
}
