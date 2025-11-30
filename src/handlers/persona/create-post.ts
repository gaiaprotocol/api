import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import { createPersonaPost } from '../../db/persona/post';

const MAX_CONTENT_LEN = 10_000;

export async function handleCreatePersonaPost(request: Request, env: Env) {
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
      content: z.string().trim().min(1, 'content is empty').max(MAX_CONTENT_LEN),
      attachments: z.record(z.unknown()).optional(),
      parentPostId: z.number().int().positive().optional(),
      repostOfId: z.number().int().positive().optional(),
      quoteOfId: z.number().int().positive().optional(),
    }).refine(
      (v) => {
        const flags = [v.parentPostId, v.repostOfId, v.quoteOfId].filter(
          (x) => x !== undefined
        );
        return flags.length <= 1;
      },
      { message: 'Only one of parentPostId, repostOfId, quoteOfId can be provided.' }
    );

    const parsed = schema.parse(body);

    const post = await createPersonaPost(env, {
      author: payload.sub,
      content: parsed.content,
      attachments: parsed.attachments ?? null,
      parentPostId: parsed.parentPostId ?? null,
      repostOfId: parsed.repostOfId ?? null,
      quoteOfId: parsed.quoteOfId ?? null,
    });

    return jsonWithCors(post, 201);
  } catch (err) {
    console.error('[handleCreatePersonaPost] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
