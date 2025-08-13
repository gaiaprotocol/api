import { checkGodMode } from '@gaiaprotocol/god-mode-worker';
import { z } from 'zod';
import { verifyToken } from '../services/jwt';

const BLACKLIST = ['gaia', 'gaiaprotocol', 'gaia_protocol']
const MAX_NAME_LENGTH = 100
const TABLE_NAME = 'gaia_names'

function isValidName(name: string): boolean {
  if (!name) return false
  if (!/^[a-z0-9-]+$/.test(name)) return false
  if (name.startsWith('-') || name.endsWith('-')) return false
  if (name.includes('--')) return false
  if (name !== name.normalize('NFC')) return false
  return true
}

export async function handleSetName(request: Request, env: Env) {
  try {
    const auth = request.headers.get('authorization')
    if (!auth?.startsWith('Bearer ')) {
      return Response.json({ error: 'Missing or invalid authorization token.' }, { status: 401 })
    }

    const token = auth.slice(7)

    let payload
    try {
      payload = await verifyToken(token, env)
    } catch {
      return Response.json({ error: 'Invalid or expired token. Please log in again.' }, { status: 401 })
    }

    if (!payload?.sub) {
      return Response.json({ error: 'Invalid token payload.' }, { status: 401 })
    }

    const body = await request.json()

    const schema = z.object({ name: z.string() })
    const { name: rawName } = schema.parse(body)

    const name = rawName.toLowerCase().trim()

    if (name.length > MAX_NAME_LENGTH) {
      return Response.json({ error: `The provided name exceeds the maximum length of ${MAX_NAME_LENGTH} characters.` }, { status: 400 })
    }

    if (!isValidName(name)) {
      return Response.json({ error: 'The provided name contains invalid characters or format.' }, { status: 400 })
    }

    if (BLACKLIST.includes(name)) {
      return Response.json({ error: `The name "${name}" is reserved and cannot be used.` }, { status: 400 })
    }

    const godMode = await checkGodMode(payload.sub)
    if (!godMode) {
      return Response.json({ error: 'You do not have permission to set a name. (God Mode required)' }, { status: 403 })
    }

    const existing = await env.DB.prepare(
      `SELECT name FROM ${TABLE_NAME} WHERE name = ?`
    ).bind(name).first()

    if (existing) {
      return Response.json({ error: `The name "${name}" is already taken. Please choose another.` }, { status: 409 })
    }

    await env.DB.prepare(`
      INSERT INTO ${TABLE_NAME} (account, name, created_at, updated_at)
      VALUES (?, ?, datetime('now'), NULL)
      ON CONFLICT(name) DO UPDATE SET
        account = excluded.account,
        updated_at = datetime('now')
    `).bind(payload.sub, name).run()

    return Response.json({ ok: true })
  } catch (err) {
    console.error(err)
    return Response.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
