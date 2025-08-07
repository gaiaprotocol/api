import { fetchAndStoreNftOwnershipRange } from '@gaiaprotocol/worker-common';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { z } from 'zod';
import { jsonWithCors } from '../services/cors';

const client = createPublicClient({ chain: mainnet, transport: http() });

const schema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const NFT_ADDRESS = '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372';

export async function handleInitNftOwnership(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json();
    const { start, end } = schema.parse(body);

    if (end < start) {
      return jsonWithCors({ error: "'end' must be greater than or equal to 'start'" }, 400);
    }

    await fetchAndStoreNftOwnershipRange(env, client, NFT_ADDRESS, start, end);

    return jsonWithCors({
      message: `NFT ownership initialized for token range ${start} to ${end}`,
    });

  } catch (err) {
    console.error('Error in /init-nft-ownership:', err);
    return jsonWithCors({ error: 'Invalid request or internal error' }, 400);
  }
}
