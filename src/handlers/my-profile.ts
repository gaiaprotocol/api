import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common'

const TABLE_NAME = 'profiles'

export async function handleMyProfile(request: Request, env: Env) {
  try {
    // 1) 인증 확인
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401)
    }

    const token = auth.slice(7)

    let payload: any
    try {
      payload = await verifyToken(token, env)
    } catch {
      return jsonWithCors({ error: 'Invalid or expired token. Please log in again.' }, 401)
    }

    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401)
    }

    // 2) 프로필 단건 조회
    const stmt = `
      SELECT account, nickname, bio, profile_image, created_at, updated_at
      FROM ${TABLE_NAME}
      WHERE account = ?
    `
    const row = await env.DB.prepare(stmt).bind(payload.sub).first()

    if (!row) {
      return jsonWithCors({ error: 'Profile not found for this account.' }, 404)
    }

    // D1/SQLite 드라이버에 따라 INTEGER가 string으로 돌아올 수 있으므로 number로 보정
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
      profile_image: row.profile_image ?? null,
      created_at: Number.isFinite(createdAt) ? createdAt : null,
      updated_at: Number.isFinite(updatedAt as number) ? updatedAt : null,
    })
  } catch (err) {
    console.error(err)
    return jsonWithCors({ error: 'Internal server error.' }, 500)
  }
}
