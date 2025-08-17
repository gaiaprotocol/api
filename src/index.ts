import { syncNftOwnershipFromEvents } from '@gaiaprotocol/worker-common';
import { WorkerEntrypoint } from 'cloudflare:workers';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { handleGetNames } from './handlers/get-names';
import { handleHeldNftsRequest } from './handlers/held-nfts';
import { handleInitNftOwnership } from './handlers/init-nft-ownership';
import { handleNftDataRequest } from './handlers/nft';
import { handleNftDataByIds } from './handlers/nft-by-ids';
import { handleNotices } from './handlers/notice';
import { handleSearchNames } from './handlers/search-names';
import { handleSetName } from './handlers/set-name';
import { preflightResponse } from './services/cors';
import { fetchNftDataByIds } from './services/nft';

const CLIENT = createPublicClient({ chain: mainnet, transport: http() });
const NFT_ADDRESS = '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372';
const TOKEN_RANGE = { start: 0, end: 3332 };
const BLOCK_STEP = 500;

export default class ApiWorker extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return preflightResponse();
    }

    const url = new URL(request.url);

    if (url.pathname === '/notices') return handleNotices(this.env);
    if (url.pathname === '/set-name') return handleSetName(request, this.env);
    if (url.pathname === '/get-names') return handleGetNames(request, this.env);
    if (url.pathname === '/search-names') return handleSearchNames(request, this.env);
    if (url.pathname === '/init-nft-ownership') return handleInitNftOwnership(request, this.env);
    if (url.pathname.startsWith('/nft/')) return handleNftDataRequest(request, this.env);
    if (url.pathname.endsWith('/nfts')) return handleHeldNftsRequest(request, this.env);
    if (url.pathname === '/nfts/by-ids') return handleNftDataByIds(request, this.env);

    return new Response('Not Found', { status: 404 });
  }

  async scheduled(controller: ScheduledController) {
    await syncNftOwnershipFromEvents(this.env, CLIENT, { [NFT_ADDRESS]: TOKEN_RANGE }, BLOCK_STEP);
  }

  fetchNftDataByIds(ids: string[]): Promise<Record<string, any>> {
    return fetchNftDataByIds(this.env, ids)
  }
};
