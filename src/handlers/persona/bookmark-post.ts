import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import {
  bookmarkPersonaPostService,
  unbookmarkPersonaPostService,
} from '../../services/persona/post';

export async function handleBookmarkPersonaPost(request: Request, env: Env) {
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
      postId: z.number().int().positive(),
    });

    const { postId } = schema.parse(body);

    await bookmarkPersonaPostService(env, postId, payload.sub);

    return jsonWithCors({ ok: true }, 200);
  } catch (err) {
    console.error('[handleBookmarkPersonaPost] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

export async function handleUnbookmarkPersonaPost(request: Request, env: Env) {
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
      postId: z.number().int().positive(),
    });

    const { postId } = schema.parse(body);

    await unbookmarkPersonaPostService(env, postId, payload.sub);

    return jsonWithCors({ ok: true }, 200);
  } catch (err) {
    console.error('[handleUnbookmarkPersonaPost] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
