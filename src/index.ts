import { handleGetNames } from "./handlers/get-names";
import { handleNotices } from "./handlers/notice";
import { handleSetName } from "./handlers/set-name";
import { preflightResponse } from "./services/cors";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return preflightResponse();
    }

    const url = new URL(request.url);

    if (url.pathname === '/notices') {
      return handleNotices(env);
    }

    if (url.pathname === '/set-name') {
      return handleSetName(request, env);
    }

    if (url.pathname === '/get-names') {
      return handleGetNames(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
