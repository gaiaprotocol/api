import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import { softDeletePersonaPostService } from '../../services/persona/post';

export async function handleDeletePersonaPost(request: Request, env: Env) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    let payload: any;

    try {
      payload = await verifyToken(token, env);
    } catch {
      return jsonWithCors({ error: 'Invalid or expired token. Please log in again.' }, 401);
    }

    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      id: z.number().int().positive(),
    });

    const { id } = schema.parse(body);

    const ok = await softDeletePersonaPostService(env, id, payload.sub);

    if (!ok) {
      return jsonWithCors({ error: 'Post not found or you are not the author.' }, 404);
    }

    return jsonWithCors({ ok: true }, 200);
  } catch (err) {
    console.error('[handleDeletePersonaPost] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
