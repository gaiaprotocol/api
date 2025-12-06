import {
  getPersonaAddressForChatMessage as getPersonaAddressForChatMessageDb,
  insertPersonaChatMessage,
  queryPersonaChatMessages,
  queryPersonaChatReactions,
  togglePersonaChatReactionRow,
} from "../../db/persona/chat";
import type { PersonaChatMessage, PersonaChatReaction } from "../../types/chat";
import { createNotificationWithEnv } from "../notifications";

/**
 * Create a chat message in persona room and emit notifications if needed.
 *
 * - DB 레이어의 insertPersonaChatMessage 가 이미 profiles 와 JOIN 해서
 *   senderProfile 이 포함된 PersonaChatMessage 를 단일 쿼리로 반환합니다.
 */
export async function sendPersonaChatMessage(
  env: Env,
  params: {
    persona: `0x${string}`;
    sender: `0x${string}`;
    senderIp: string | null;
    content: string;
    attachments?: unknown | null;
    parentMessageId?: number | null;
  },
): Promise<PersonaChatMessage> {
  const message = await insertPersonaChatMessage(env, {
    persona: params.persona,
    sender: params.sender,
    senderIp: params.senderIp,
    content: params.content,
    attachments: params.attachments ?? null,
    parentMessageId: params.parentMessageId ?? null,
  });

  // parentMessageId 가 있으면, 부모 메시지 sender 에게 reply 알림 발송
  if (params.parentMessageId) {
    const parent = await env.DB.prepare(
      `SELECT sender FROM persona_chat_messages WHERE id = ?`,
    )
      .bind(params.parentMessageId)
      .first<{ sender: string } | null>();

    if (parent && parent.sender !== params.sender) {
      await createNotificationWithEnv(env, {
        recipient: parent.sender,
        actor: params.sender,
        actorType: "wallet",
        notificationType: "chat.reply",
        targetId: String(params.parentMessageId),
        metadata: {
          persona: params.persona,
          messageId: message.id,
        },
      });
    }
  }

  return message;
}

/**
 * Toggle reaction and emit notification on add.
 *
 * - togglePersonaChatReactionRow 가 실제 DB 토글을 수행합니다.
 * - "added" 일 때만 메시지 주인에게 알림을 보냅니다.
 */
export async function togglePersonaChatReaction(
  env: Env,
  params: { messageId: number; reactor: `0x${string}`; reactionType: string },
): Promise<"added" | "removed"> {
  const result = await togglePersonaChatReactionRow(env, params);

  if (result === "added") {
    const owner = await env.DB.prepare(
      `SELECT sender FROM persona_chat_messages WHERE id = ?`,
    )
      .bind(params.messageId)
      .first<{ sender: string } | null>();

    if (owner && owner.sender !== params.reactor) {
      await createNotificationWithEnv(env, {
        recipient: owner.sender,
        actor: params.reactor,
        actorType: "wallet",
        notificationType: "chat.reaction",
        targetId: String(params.messageId),
        metadata: {
          messageId: params.messageId,
          reactionType: params.reactionType,
        },
      });
    }
  }

  return result;
}

/**
 * Get persona address for a chat message (to run access checks in handlers).
 *
 * - DB 레이어 헬퍼를 그대로 래핑해서 외부에 노출합니다.
 */
export async function getPersonaAddressForChatMessage(
  env: Env,
  messageId: number,
): Promise<`0x${string}` | null> {
  return getPersonaAddressForChatMessageDb(env, messageId);
}

/**
 * 메시지 목록 조회 서비스
 *
 * - queryPersonaChatMessages 가 persona_chat_messages + profiles 를
 *   한 번에 SELECT 해서, 각 메시지에 senderProfile 이 포함된 배열을 반환합니다.
 */
export async function listPersonaChatMessagesService(
  env: Env,
  params: { persona: string; limit: number; offset: number },
): Promise<PersonaChatMessage[]> {
  return queryPersonaChatMessages(env, params);
}

/**
 * 리액션 목록 조회 서비스
 *
 * - queryPersonaChatReactions 가 reactions 배열과 counts 를 함께 반환.
 */
export async function listPersonaChatReactionsService(
  env: Env,
  messageId: number,
): Promise<{ reactions: PersonaChatReaction[]; counts: Record<string, number> }> {
  return queryPersonaChatReactions(env, messageId);
}
