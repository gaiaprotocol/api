import { verifyToken } from '@gaiaprotocol/worker-common';
import { hasPersonaAccess } from '../utils/persona-access';

/**
 * Durable Object that represents a single persona chat room.
 * All WebSocket connections for the same persona are routed to the same instance.
 */
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

    // WebSocket upgrade path
    if (request.headers.get('Upgrade') === 'websocket') {
      const persona = url.searchParams.get('persona');
      const token = url.searchParams.get('token');

      if (!persona || !/^0x[a-fA-F0-9]{40}$/.test(persona)) {
        return new Response('Invalid persona', { status: 400 });
      }
      if (!token) {
        return new Response('Missing token', { status: 401 });
      }

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

      // Check whether this address is allowed to join the persona room
      const allowed = await hasPersonaAccess(
        this.env,
        persona as `0x${string}`,
        addr,
      );
      if (!allowed) {
        return new Response('Forbidden', { status: 403 });
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];

      server.accept();
      this.sockets.add(server);

      server.addEventListener('close', () => this.sockets.delete(server));
      server.addEventListener('error', () => this.sockets.delete(server));

      server.send(
        JSON.stringify({
          type: 'hello',
          persona,
          address: addr,
        }),
      );

      return new Response(null, { status: 101, webSocket: client });
    }

    // HTTP broadcast endpoint, called from the main Worker
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

/**
 * Helper used by the main Worker (index.ts) to route
 * `/persona/chat/ws` requests into the correct Durable Object instance.
 *
 * - Expects `persona` and `token` query parameters.
 * - Uses `persona` as the DO id key so that all sockets for the same
 *   persona land on the same instance.
 */
export async function handlePersonaChatWebSocket(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const persona = url.searchParams.get('persona');

  if (!persona || !/^0x[a-fA-F0-9]{40}$/.test(persona)) {
    return new Response('Invalid persona', { status: 400 });
  }

  // Use persona (lowercased) as the deterministic DO id
  const id = env.PERSONA_CHAT_ROOM.idFromName(persona.toLowerCase());
  const stub = env.PERSONA_CHAT_ROOM.get(id);

  // Forward the original request into the Durable Object
  return stub.fetch(request);
}
