import { verifyToken } from '@gaiaprotocol/worker-common';
import { hasPersonaAccess } from '../utils/persona-access';

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function isValidEvmAddress(value: string | null): value is `0x${string}` {
  return !!value && EVM_ADDRESS_REGEX.test(value);
}

/**
 * Durable Object that represents a single persona chat room.
 * - Each DO instance corresponds to exactly one persona address.
 * - All WebSocket connections for the same persona are routed to the same instance.
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
    const upgrade = request.headers.get('Upgrade') || request.headers.get('upgrade');

    // WebSocket upgrade path
    if (upgrade === 'websocket') {
      return this.handleWebSocketUpgrade(request, url);
    }

    // HTTP broadcast endpoint, called from the main Worker
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    return new Response('Not found', { status: 404 });
  }

  /* ================================================================== */
  /*  WebSocket upgrade                                                  */
  /* ================================================================== */

  private async handleWebSocketUpgrade(request: Request, url: URL): Promise<Response> {
    const personaParam = url.searchParams.get('persona');
    const token = url.searchParams.get('token');

    // Basic persona validation
    if (!isValidEvmAddress(personaParam)) {
      return new Response('Invalid persona', { status: 400 });
    }
    const persona = personaParam as `0x${string}`;

    if (!token) {
      return new Response('Missing token', { status: 401 });
    }

    // Verify token and extract address
    let addr: `0x${string}`;
    try {
      const payload: any = await verifyToken(token, this.env);

      if (!isValidEvmAddress(payload?.sub)) {
        return new Response('Invalid token', { status: 401 });
      }

      addr = payload.sub as `0x${string}`;
    } catch (err) {
      console.error('[PersonaChatRoomDO] verifyToken error', err);
      return new Response('Invalid or expired token', { status: 401 });
    }

    // Check whether this address is allowed to join the persona room
    try {
      const allowed = await hasPersonaAccess(this.env, persona, addr);
      if (!allowed) {
        return new Response('Forbidden', { status: 403 });
      }
    } catch (err) {
      console.error('[PersonaChatRoomDO] hasPersonaAccess error', err);
      // 안전하게 막아버리는 쪽으로
      return new Response('Forbidden', { status: 403 });
    }

    // WebSocketPair 생성 및 등록
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.registerSocket(server);

    // 초기 hello 이벤트 전송
    server.send(
      JSON.stringify({
        type: 'hello',
        persona,
        address: addr,
      }),
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  private registerSocket(ws: WebSocket) {
    this.sockets.add(ws);

    ws.addEventListener('close', () => {
      this.sockets.delete(ws);
    });

    ws.addEventListener('error', (err) => {
      console.error('[PersonaChatRoomDO] WebSocket error', err);
      this.sockets.delete(ws);
      try {
        ws.close();
      } catch {
        // ignore
      }
    });
  }

  /* ================================================================== */
  /*  Broadcast                                                          */
  /* ================================================================== */

  /**
   * HTTP broadcast endpoint, called from the main Worker.
   *
   * - This DO instance already corresponds to a specific persona (via idFromName).
   * - The body should be a JSON string representing a ChatWsEvent-like object.
   * - We don't inspect/transform the payload here; just fan out to live sockets.
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    let payload: string;

    try {
      // 그대로 문자열로 읽어서 브로드캐스트
      payload = await request.text();
    } catch (err) {
      console.error('[PersonaChatRoomDO] Failed to read broadcast body', err);
      return new Response('Bad Request', { status: 400 });
    }

    for (const ws of this.sockets) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error('[PersonaChatRoomDO] Failed to send to socket', err);
        this.sockets.delete(ws);
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }

    return new Response('ok');
  }
}

/* ==================================================================== */
/*  Entry helper from main Worker                                       */
/* ==================================================================== */

/**
 * Helper used by the main Worker (index.ts) to route
 * `/persona/chat/ws` requests into the correct Durable Object instance.
 *
 * - Expects `persona` and `token` query parameters.
 * - Uses `persona` (lowercased) as the DO id key so that all sockets for the same
 *   persona land on the same instance.
 */
export async function handlePersonaChatWebSocket(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  const upgrade = request.headers.get('Upgrade') || request.headers.get('upgrade');
  if (upgrade !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const personaParam = url.searchParams.get('persona');

  if (!isValidEvmAddress(personaParam)) {
    return new Response('Invalid persona', { status: 400 });
  }

  const persona = personaParam as `0x${string}`;

  // Use persona (lowercased) as the deterministic DO id
  const id = env.PERSONA_CHAT_ROOM.idFromName(persona.toLowerCase());
  const stub = env.PERSONA_CHAT_ROOM.get(id);

  // Forward the original request into the Durable Object
  return stub.fetch(request);
}
