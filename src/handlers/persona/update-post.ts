import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import { updatePersonaPostService } from '../../services/persona/post';

const MAX_CONTENT_LEN = 10_000;

export async function handleUpdatePersonaPost(request: Request, env: Env) {
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
      content: z.string().trim().max(MAX_CONTENT_LEN).optional(),
      attachments: z.record(z.unknown()).nullable().optional(),
    }).refine(
      (v) => v.content !== undefined || v.attachments !== undefined,
      { message: 'At least one of content or attachments must be provided.' },
    );

    const parsed = schema.parse(body);

    const authorIp =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for') ||
      null;

    const updated = await updatePersonaPostService(env, {
      postId: parsed.id,
      author: payload.sub,
      authorIp,
      content: parsed.content,
      attachments: parsed.attachments ?? undefined,
    });

    if (!updated) {
      return jsonWithCors({ error: 'Post not found or you are not the author.' }, 404);
    }

    return jsonWithCors(updated, 200);
  } catch (err) {
    console.error('[handleUpdatePersonaPost] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
