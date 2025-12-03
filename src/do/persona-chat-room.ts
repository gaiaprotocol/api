import {
  corsHeaders,
  jsonWithCors,
  verifyToken,
} from '@gaiaprotocol/worker-common';
import { hasPersonaAccess } from '../utils/persona-access';

const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function isValidEvmAddress(value: string | null): value is `0x${string}` {
  return !!value && EVM_ADDRESS_REGEX.test(value);
}

/**
 * Durable Object that represents a single persona chat room.
 *
 * - Each DO instance corresponds to exactly ONE persona address.
 * - All WebSocket connections for the same persona are routed
 *   to the same instance via idFromName(persona.toLowerCase()).
 */
export class PersonaChatRoomDO {
  private readonly state: DurableObjectState;
  private readonly env: Env;
  /** Live WebSocket connections for this persona room */
  private sockets: Set<WebSocket> = new Set();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgrade =
      request.headers.get('Upgrade') || request.headers.get('upgrade');

    // -------------------------------------------------------------------
    // WebSocket 연결 처리
    // -------------------------------------------------------------------
    if (upgrade === 'websocket') {
      return this.handleWebSocketUpgrade(request, url);
    }

    // -------------------------------------------------------------------
    // HTTP broadcast endpoint (메시지 브로드캐스트용)
    //  - 메인 워커에서만 호출
    //  - body 는 그대로 문자열로 읽어서 소켓에 전달
    // -------------------------------------------------------------------
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      return this.handleBroadcast(request);
    }

    // 그 외 경로는 404
    return jsonWithCors('Not found', 404);
  }

  /* ================================================================== */
  /*  WebSocket upgrade                                                  */
  /* ================================================================== */

  private async handleWebSocketUpgrade(
    request: Request,
    url: URL,
  ): Promise<Response> {
    const personaParam = url.searchParams.get('persona');
    const token = url.searchParams.get('token');

    // 1) persona 형식 검증
    if (!isValidEvmAddress(personaParam)) {
      return new Response('Invalid persona', {
        status: 400,
        headers: corsHeaders(),
      });
    }
    const persona = personaParam as `0x${string}`;

    // 2) 토큰 존재 여부
    if (!token) {
      return new Response('Missing token', {
        status: 401,
        headers: corsHeaders(),
      });
    }

    // 3) 토큰 검증 및 user address 추출
    let addr: `0x${string}`;
    try {
      const payload: any = await verifyToken(token, this.env);

      if (!isValidEvmAddress(payload?.sub)) {
        return new Response('Invalid token', {
          status: 401,
          headers: corsHeaders(),
        });
      }

      addr = payload.sub as `0x${string}`;
    } catch (err) {
      console.error('[PersonaChatRoomDO] verifyToken error', err);
      return new Response('Invalid or expired token', {
        status: 401,
        headers: corsHeaders(),
      });
    }

    // 4) persona 방 입장 권한 확인
    try {
      const allowed = await hasPersonaAccess(this.env, persona, addr);
      if (!allowed) {
        return new Response('Forbidden', {
          status: 403,
          headers: corsHeaders(),
        });
      }
    } catch (err) {
      console.error('[PersonaChatRoomDO] hasPersonaAccess error', err);
      // 안전하게 막기
      return new Response('Forbidden', {
        status: 403,
        headers: corsHeaders(),
      });
    }

    // 5) WebSocketPair 생성 및 등록
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();
    this.registerSocket(server);

    // 최초 hello 이벤트 전송
    server.send(
      JSON.stringify({
        type: 'hello',
        persona,
        address: addr,
      }),
    );

    // 101 Switching Protocols + CORS 헤더
    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: corsHeaders(),
    });
  }

  /** 새 WebSocket 연결을 이 DO 인스턴스에 등록 */
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
   * - 이 DO 인스턴스는 이미 특정 persona 에 대응됨 (idFromName 으로 생성 됨)
   * - body 는 ChatWsEvent(JSON string) 이라고 가정하고 검사 없이 그대로 전달
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    let payload: string;

    try {
      payload = await request.text();
    } catch (err) {
      console.error(
        '[PersonaChatRoomDO] Failed to read broadcast body',
        err,
      );
      return jsonWithCors('Bad Request', 400);
    }

    for (const ws of this.sockets) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error(
          '[PersonaChatRoomDO] Failed to send to socket, closing',
          err,
        );
        this.sockets.delete(ws);
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }

    return jsonWithCors('ok');
  }
}

/* ==================================================================== */
/*  Entry helper from main Worker                                       */
/* ==================================================================== */

/**
 * 메인 API Worker 에서 `/persona/chat/ws` 요청을
 * 올바른 PersonaChatRoomDO 인스턴스로 라우팅하는 헬퍼.
 *
 * - query: persona, token (token 검증은 DO 내부에서 처리)
 * - idFromName(persona.toLowerCase()) 로 DO id 생성
 */
export async function handlePersonaChatWebSocket(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  const upgrade =
    request.headers.get('Upgrade') || request.headers.get('upgrade');
  if (upgrade !== 'websocket') {
    return new Response('Expected WebSocket upgrade', {
      status: 426,
      headers: corsHeaders(),
    });
  }

  const personaParam = url.searchParams.get('persona');
  if (!isValidEvmAddress(personaParam)) {
    return new Response('Invalid persona', {
      status: 400,
      headers: corsHeaders(),
    });
  }

  const persona = personaParam as `0x${string}`;

  // persona(lowercased)를 key 로 해서 항상 같은 DO 인스턴스로 라우팅
  const id = env.PERSONA_CHAT_ROOM.idFromName(persona.toLowerCase());
  const stub = env.PERSONA_CHAT_ROOM.get(id);

  // 원래 요청을 그대로 DO 로 포워드
  return stub.fetch(request);
}
