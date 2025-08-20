import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common'

const TABLE_NAME = 'gaia_names'

export async function handleMyName(request: Request, env: Env) {
  try {
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401)
    }

    const token = auth.slice(7)

    let payload
    try {
      payload = await verifyToken(token, env)
    } catch {
      return jsonWithCors({ error: 'Invalid or expired token. Please log in again.' }, 401)
    }

    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401)
    }

    const stmt = `SELECT account, name FROM ${TABLE_NAME} WHERE account = ?`
    const result = await env.DB.prepare(stmt).bind(payload.sub).first()

    if (!result) {
      return jsonWithCors({ error: 'Name not found for this account.' }, 404)
    }

    return jsonWithCors({
      address: result.account,
      name: result.name,
    })
  } catch (err) {
    console.error(err)
    return jsonWithCors({ error: 'Internal server error.' }, 500)
  }
}
