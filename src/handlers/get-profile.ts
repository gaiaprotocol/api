import { jsonWithCors } from '@gaiaprotocol/worker-common'

const TABLE_NAME = 'profiles'

export async function handleGetProfile(request: Request, env: Env) {
  try {
    // 1) URL 파라미터에서 account 값 추출
    const url = new URL(request.url)
    const account = url.searchParams.get('account')

    if (!account) {
      return jsonWithCors({ error: 'Missing account parameter.' }, 400)
    }

    // 2) 프로필 조회
    const stmt = `
      SELECT account, nickname, bio, avatar_url, banner_url, created_at, updated_at
      FROM ${TABLE_NAME}
      WHERE account = ?
    `
    const row = await env.DB.prepare(stmt).bind(account).first()

    if (!row) {
      return jsonWithCors({ error: 'Profile not found for this account.' }, 404)
    }

    // created_at, updated_at 보정
    const createdAt =
      typeof row.created_at === 'number' ? row.created_at : Number(row.created_at)
    const updatedAt =
      row.updated_at == null
        ? null
        : (typeof row.updated_at === 'number' ? row.updated_at : Number(row.updated_at))

    return jsonWithCors({
      account: row.account,
      nickname: row.nickname ?? null,
      bio: row.bio ?? null,
      avatarUrl: row.avatar_url ?? null,
      bannerUrl: row.banner_url ?? null,
      createdAt: Number.isFinite(createdAt) ? createdAt : null,
      updatedAt: Number.isFinite(updatedAt as number) ? updatedAt : null,
    })
  } catch (err) {
    console.error(err)
    return jsonWithCors({ error: 'Internal server error.' }, 500)
  }
}
