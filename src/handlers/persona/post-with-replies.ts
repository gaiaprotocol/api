import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import { getPersonaPostWithReplies } from '../../db/persona/post';

export async function handlePersonaPostWithReplies(request: Request, env: Env) {
  try {
    const url = new URL(request.url);

    const schema = z.object({
      id: z.coerce.number().int().positive('id must be positive'),
    });

    const parsed = schema.parse({
      id: url.searchParams.get('id'),
    });

    const result = await getPersonaPostWithReplies(env, parsed.id);

    if (!result) {
      return jsonWithCors({ error: 'Post not found' }, 404);
    }

    return jsonWithCors(result, 200);
  } catch (err) {
    console.error('[handlePersonaPostWithReplies] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
