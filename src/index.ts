import { syncNftOwnershipFromEvents } from '@gaiaprotocol/worker-common';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { handleGetNames } from './handlers/get-names';
import { handleInitNftOwnership } from './handlers/init-nft-ownership';
import { handleNotices } from './handlers/notice';
import { handleSearchNames } from './handlers/search-names';
import { handleSetName } from './handlers/set-name';
import { preflightResponse } from './services/cors';

const CLIENT = createPublicClient({ chain: mainnet, transport: http() });
const NFT_ADDRESS = '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372';
const TOKEN_RANGE = { start: 0, end: 3332 };
const BLOCK_STEP = 500;

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return preflightResponse();
    }

    const url = new URL(request.url);

    if (url.pathname === '/notices') return handleNotices(env);
    if (url.pathname === '/set-name') return handleSetName(request, env);
    if (url.pathname === '/get-names') return handleGetNames(request, env);
    if (url.pathname === '/search-names') return handleSearchNames(request, env);
    if (url.pathname === '/init-nft-ownership') return handleInitNftOwnership(request, env);

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    await syncNftOwnershipFromEvents(env, CLIENT, { [NFT_ADDRESS]: TOKEN_RANGE }, BLOCK_STEP);
  },
} satisfies ExportedHandler<Env>;
