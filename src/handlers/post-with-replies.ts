import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import { getPostWithReplies } from '../db/post';

export async function handlePostWithReplies(request: Request, env: Env) {
  try {
    const url = new URL(request.url);

    // ?id=123 형태로 받는다 (문자열 → 숫자 coerce)
    const schema = z.object({
      id: z.coerce
        .number()
        .int('id must be an integer')
        .positive('id must be positive'),
    });

    const parsed = schema.safeParse({
      id: url.searchParams.get('id'),
    });

    if (!parsed.success) {
      return jsonWithCors({ error: parsed.error.message }, 400);
    }

    const postId = parsed.data.id;

    const result = await getPostWithReplies(env, postId);

    if (!result) {
      return jsonWithCors({ error: 'Post not found' }, 404);
    }

    // { post, replyPosts } 그대로 내려줌
    return jsonWithCors(result, 200);
  } catch (err) {
    console.error('[handlePostWithReplies] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
