import { ens_normalize } from '@adraffy/ens-normalize';
import { checkGodMode } from '@gaiaprotocol/god-mode-worker';
import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';

const BLACKLIST = ['gaia', 'gaiaprotocol', 'gaia_protocol'];
const MAX_NAME_LENGTH = 100;
const TABLE_NAME = 'gaia_names';

/** ENS 규격으로 유효 여부만 확인 (정규화 가능하면 true) */
export function isValidENSName(name: string): boolean {
  try {
    ens_normalize(name); // 정규화 시도. 불가하면 에러 throw
    return true;         // ENS 기준 “정상화 가능 = 유효”
  } catch {
    return false;
  }
}

/** 입력이 이미 정규화된 형태인지까지 강제하고 싶다면 */
export function isNormalizedENSName(name: string): boolean {
  try {
    return ens_normalize(name) === name;
  } catch {
    return false;
  }
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

    let name = rawName.toLowerCase().trim();

    if (!isValidENSName(name)) {
      return jsonWithCors({ error: 'The provided name contains invalid characters or format.' }, 400);
    }
    name = ens_normalize(name);

    if (name.length > MAX_NAME_LENGTH) {
      return jsonWithCors({ error: `The provided name exceeds the maximum length of ${MAX_NAME_LENGTH} characters.` }, 400);
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
      VALUES (?, ?, strftime('%s','now'), NULL)
      ON CONFLICT(account) DO UPDATE SET
        name       = excluded.name,
        updated_at = strftime('%s','now')
    `).bind(payload.sub, name).run();

    return jsonWithCors({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
