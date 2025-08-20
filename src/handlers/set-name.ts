import { checkGodMode } from '@gaiaprotocol/god-mode-worker';
import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';

const BLACKLIST = ['gaia', 'gaiaprotocol', 'gaia_protocol'];
const MAX_NAME_LENGTH = 100;
const TABLE_NAME = 'gaia_names';

function isValidName(name: string): boolean {
  if (!name) return false;
  if (!/^[a-z0-9-]+$/.test(name)) return false;
  if (name.startsWith('-') || name.endsWith('-')) return false;
  if (name.includes('--')) return false;
  if (name !== name.normalize('NFC')) return false;
  return true;
}

export async function handleSetName(request: Request, env: Env) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);

    let payload;
    try {
      payload = await verifyToken(token, env);
    } catch {
      return jsonWithCors({ error: 'Invalid or expired token. Please log in again.' }, 401);
    }

    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    const body = await request.json();

    const schema = z.object({ name: z.string() });
    const { name: rawName } = schema.parse(body);

    const name = rawName.toLowerCase().trim();

    if (name.length > MAX_NAME_LENGTH) {
      return jsonWithCors({ error: `The provided name exceeds the maximum length of ${MAX_NAME_LENGTH} characters.` }, 400);
    }

    if (!isValidName(name)) {
      return jsonWithCors({ error: 'The provided name contains invalid characters or format.' }, 400);
    }

    if (BLACKLIST.includes(name)) {
      return jsonWithCors({ error: `The name "${name}" is reserved and cannot be used.` }, 400);
    }

    const godMode = await checkGodMode(payload.sub);
    if (!godMode) {
      return jsonWithCors({ error: 'You do not have permission to set a name. (God Mode required)' }, 403);
    }

    const existing = await env.DB.prepare(
      `SELECT name FROM ${TABLE_NAME} WHERE name = ?`
    ).bind(name).first();

    if (existing) {
      return jsonWithCors({ error: `The name "${name}" is already taken. Please choose another.` }, 409);
    }

    // 핵심만 발췌
    await env.DB.prepare(`
      INSERT INTO ${TABLE_NAME} (account, name, created_at, updated_at)
      VALUES (?, ?, datetime('now'), NULL)
      ON CONFLICT(account) DO UPDATE SET
        name       = excluded.name,
        updated_at = datetime('now')
    `).bind(payload.sub, name).run();

    return jsonWithCors({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
