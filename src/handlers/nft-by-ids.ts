import { jsonWithCors } from "@gaiaprotocol/worker-common";
import { z } from 'zod';
import { fetchNftDataByIds } from '../services/nft';

const requestSchema = z.object({
  ids: z.array(z.string().min(1)).nonempty("ids must not be empty").max(500),
});

// POST /nfts/by-ids  with body: { "ids": ["gaia-protocol-gods:1", "2", "gaia-protocol-gods:3"] }
export async function handleNftDataByIds(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors({ error: parsed.error.message }, 400);
    }

    const { ids } = parsed.data;
    const results = await fetchNftDataByIds(env, ids);

    return jsonWithCors({ results }, 200);
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      400 // 잘못된 id나 컬렉션일 수 있으므로 400으로 반환
    );
  }
}
