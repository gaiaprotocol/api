import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import { createPersonaChatMessage, listPersonaChatMessages } from '../../db/persona/chat';
import { hasPersonaAccess } from '../../utils/persona-access';

const MAX_CONTENT_LEN = 10_000;

const createSchema = z.object({
  persona: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid persona address'),
  content: z.string().trim().min(1, 'content is empty').max(MAX_CONTENT_LEN),
  attachments: z.unknown().optional(),
  parentMessageId: z.number().int().positive().optional(),
});

export async function handleCreatePersonaChatMessage(request: Request, env: Env) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    const payload: any = await verifyToken(token, env).catch(() => null);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid or expired token.' }, 401);
    }

    const account = payload.sub as `0x${string}`;

    const body = await request.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { persona, content, attachments, parentMessageId } = parsed.data;
    const personaAddr = persona as `0x${string}`;

    const allowed = await hasPersonaAccess(env, personaAddr, account);
    if (!allowed) {
      return jsonWithCors({ error: 'Forbidden: not a holder or persona owner.' }, 403);
    }

    const ip =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for') ||
      null;

    const message = await createPersonaChatMessage(env, {
      persona: personaAddr,
      sender: account,
      senderIp: ip,
      content,
      attachments: attachments ?? null,
      parentMessageId: parentMessageId ?? null,
    });

    // DO 브로드캐스트 (실패해도 응답은 보내되, 최소한 로그는 남기기)
    try {
      const id = env.PERSONA_CHAT_ROOM.idFromName(personaAddr.toLowerCase());
      const stub = env.PERSONA_CHAT_ROOM.get(id);

      const res = await stub.fetch('https://persona-chat-room/broadcast', {
        method: 'POST',
        body: JSON.stringify({ type: 'message', message }),
      });

      if (!res.ok) {
        console.error(
          '[persona-chat] broadcast failed',
          personaAddr,
          res.status,
          await res.text().catch(() => '<no body>'),
        );
      }
    } catch (err) {
      console.error('[persona-chat] broadcast stub.fetch error', err);
    }

    return jsonWithCors(message, 201);
  } catch (err) {
    console.error('[handleCreatePersonaChatMessage]', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

export async function handleListPersonaChatMessages(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const persona = url.searchParams.get('persona');
    if (!persona || !/^0x[a-fA-F0-9]{40}$/.test(persona)) {
      return jsonWithCors({ error: 'persona query param is required.' }, 400);
    }

    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
    const cursor = Number(url.searchParams.get('cursor') || 0);

    const messages = await listPersonaChatMessages(env, {
      persona,
      limit,
      offset: cursor,
    });

    const nextCursor = messages.length < limit ? null : cursor + limit;

    return jsonWithCors({ messages, nextCursor });
  } catch (err) {
    console.error('[handleListPersonaChatMessages]', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
