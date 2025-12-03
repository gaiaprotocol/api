import { verifyToken } from '@gaiaprotocol/worker-common';
import { hasPersonaAccess } from '../utils/persona-access';

export class PersonaChatRoomDO {
  state: DurableObjectState;
  env: Env;
  sockets: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // WebSocket 연결
    if (request.headers.get('Upgrade') === 'websocket') {
      const persona = url.searchParams.get('persona');
      const token = url.searchParams.get('token');

      if (!persona || !/^0x[a-fA-F0-9]{40}$/.test(persona)) {
        return new Response('Invalid persona', { status: 400 });
      }
      if (!token) return new Response('Missing token', { status: 401 });

      let addr: `0x${string}`;
      try {
        const payload: any = await verifyToken(token, this.env);
        if (!payload?.sub || !/^0x[a-fA-F0-9]{40}$/.test(payload.sub)) {
          return new Response('Invalid token', { status: 401 });
        }
        addr = payload.sub as `0x${string}`;
      } catch {
        return new Response('Invalid or expired token', { status: 401 });
      }

      const allowed = await hasPersonaAccess(this.env, persona as `0x${string}`, addr);
      if (!allowed) return new Response('Forbidden', { status: 403 });

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.sockets.add(server);

      server.addEventListener('close', () => this.sockets.delete(server));
      server.addEventListener('error', () => this.sockets.delete(server));

      server.send(JSON.stringify({ type: 'hello', persona, address: addr }));

      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP broadcast
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const text = await request.text();
      for (const ws of this.sockets) {
        try {
          ws.send(text);
        } catch {
          this.sockets.delete(ws);
        }
      }
      return new Response('ok');
    }

    return new Response('Not found', { status: 404 });
  }
}
