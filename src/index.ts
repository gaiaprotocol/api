import { handleNotices } from "./handlers/notice";

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/notices') {
      return handleNotices(env);
    }

    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
