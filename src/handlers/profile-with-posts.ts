import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { getAddress } from 'viem';
import { z } from 'zod';
import { getProfileWithPosts } from '../db/profile';

export async function handleProfileWithPosts(request: Request, env: Env) {
  try {
    const url = new URL(request.url);

    // ?address=0x... 형태로 받는다
    const schema = z.object({
      address: z.string().min(1, 'address is required'),
    });

    const parsed = schema.safeParse({
      address: url.searchParams.get('address'),
    });

    if (!parsed.success) {
      return jsonWithCors({ error: parsed.error.message }, 400);
    }

    // 주소 정규화 (체크섬 등)
    const walletAddress = getAddress(parsed.data.address);

    const { profile, posts } = await getProfileWithPosts(env, walletAddress);

    // getProfileWithPosts 내부에서 프로필 없으면 fallback 프로필을 만들어 주기 때문에
    // 여기서는 404를 굳이 줄 필요 없이 항상 200으로 내려줘도 된다.
    return jsonWithCors(
      {
        profile,
        posts,
      },
      200,
    );
  } catch (err) {
    console.error('[handleProfileWithPosts] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
