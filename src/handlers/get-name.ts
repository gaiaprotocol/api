import { jsonWithCors } from '@gaiaprotocol/worker-common'
import { z } from 'zod'

const TABLE_NAME = 'gaia_names'

export async function handleGetName(request: Request, env: Env) {
  try {
    const url = new URL(request.url)

    const schema = z.object({
      name: z.string().min(1, 'name is required'),
    })

    const parsed = schema.safeParse({ name: url.searchParams.get('name') })
    if (!parsed.success) {
      return jsonWithCors({ error: parsed.error.message }, 400)
    }

    const { name } = parsed.data

    const stmt = `SELECT account, name FROM ${TABLE_NAME} WHERE name = ?`
    const result = await env.DB.prepare(stmt).bind(name).first()

    if (!result) {
      return jsonWithCors({ error: 'Account not found' }, 404)
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
