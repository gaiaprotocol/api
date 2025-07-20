import { z } from 'zod'
import { jsonWithCors } from '../services/cors'

const TABLE_NAME = 'gaia_names'

export async function handleGetNames(request: Request, env: Env) {
  try {
    const body = await request.json()

    const schema = z.object({
      addresses: z.array(
        z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address')
      ).nonempty(),
    })

    const { addresses } = schema.parse(body)

    const placeholders = addresses.map(() => '?').join(', ');
    const stmt = `SELECT account, name FROM ${TABLE_NAME} WHERE account IN (${placeholders})`

    const result = await env.DB.prepare(stmt).bind(...addresses).all();

    return jsonWithCors(
      result.results.map((row: any) => ({
        address: row.account,
        name: row.name,
      }))
    )

  } catch (err) {
    console.error(err)
    return jsonWithCors({ error: 'Internal server error.' }, 500)
  }
}
