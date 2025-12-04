import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import {
  getPersonaAddressForChatMessage,
  listPersonaChatReactionsService,
  togglePersonaChatReaction,
} from '../../services/persona/chat';
import { hasPersonaAccess } from '../../utils/persona-access';

const toggleSchema = z.object({
  messageId: z.number().int().positive(),
  reactionType: z.string().min(1).max(64),
});

export async function handleTogglePersonaChatReaction(request: Request, env: Env) {
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
    const parsed = toggleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { messageId, reactionType } = parsed.data;

    // Resolve persona of the message via service, then check access.
    const personaAddr = await getPersonaAddressForChatMessage(env, messageId);
    if (!personaAddr) {
      return jsonWithCors({ error: 'Message not found.' }, 404);
    }

    const allowed = await hasPersonaAccess(env, personaAddr, account);
    if (!allowed) {
      return jsonWithCors({ error: 'Forbidden: not a holder or persona owner.' }, 403);
    }

    const status = await togglePersonaChatReaction(env, {
      messageId,
      reactor: account,
      reactionType,
    });

    // Broadcast reaction event via DO
    try {
      const id = env.PERSONA_CHAT_ROOM.idFromName(personaAddr.toLowerCase());
      const stub = env.PERSONA_CHAT_ROOM.get(id);

      const res = await stub.fetch('https://persona-chat-room/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          type: status === 'added' ? 'reaction_added' : 'reaction_removed',
          messageId,
          reactor: account,
          reactionType,
        }),
      });

      if (!res.ok) {
        console.error(
          '[persona-chat] reaction broadcast failed',
          personaAddr,
          res.status,
          await res.text().catch(() => '<no body>'),
        );
      }
    } catch (err) {
      console.error('[persona-chat] reaction broadcast stub.fetch error', err);
    }

    return jsonWithCors({ status });
  } catch (err) {
    console.error('[handleTogglePersonaChatReaction]', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

export async function handleListPersonaChatReactions(request: Request, env: Env) {
  try {
    const url = new URL(request.url);
    const messageIdStr = url.searchParams.get('messageId');

    const messageId = messageIdStr ? Number(messageIdStr) : NaN;
    if (!Number.isFinite(messageId) || messageId <= 0) {
      return jsonWithCors({ error: 'messageId query param is required.' }, 400);
    }

    const data = await listPersonaChatReactionsService(env, messageId);
    return jsonWithCors(data);
  } catch (err) {
    console.error('[handleListPersonaChatReactions]', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
