import { syncNftOwnership } from "@gaiaprotocol/worker-common";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import { handleGetNames } from "./handlers/get-names";
import { handleNotices } from "./handlers/notice";
import { handleSearchNames } from "./handlers/search-names";
import { handleSetName } from "./handlers/set-name";
import { preflightResponse } from "./services/cors";

const client = createPublicClient({ chain: mainnet, transport: http() })

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

    return new Response('Not Found', { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    await syncNftOwnership(env, client, {
      "0x134590ACB661Da2B318BcdE6b39eF5cF8208E372": {
        start: 0,
        end: 3332
      }
    }, 1000);
  },
} satisfies ExportedHandler<Env>;
