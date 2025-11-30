import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import { listPersonaPosts } from '../../db/persona/post';

export async function handleListPersonaPosts(request: Request, env: Env) {
  try {
    const url = new URL(request.url);

    const schema = z.object({
      author: z.string().optional(),
      parentPostId: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().positive().max(100).optional(),
      offset: z.coerce.number().int().min(0).optional(),
    });

    const parsed = schema.parse({
      author: url.searchParams.get('author') ?? undefined,
      parentPostId: url.searchParams.get('parentPostId') ?? undefined,
      limit: url.searchParams.get('limit') ?? undefined,
      offset: url.searchParams.get('offset') ?? undefined,
    });

    const posts = await listPersonaPosts(env, {
      author: parsed.author,
      parentPostId: parsed.parentPostId,
      limit: parsed.limit,
      offset: parsed.offset,
    });

    return jsonWithCors({ posts }, 200);
  } catch (err) {
    console.error('[handleListPersonaPosts] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
