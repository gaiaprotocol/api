import {
  insertPersonaChatMessage,
  queryPersonaChatMessages,
  queryPersonaChatReactions,
  togglePersonaChatReactionRow,
} from "../../db/persona/chat";
import {
  createNotificationWithEnv,
} from "../notifications";

/**
 * Create a chat message in persona room and emit notifications if needed.
 */
export async function sendPersonaChatMessage(
  env: Env,
  params: {
    persona: string;
    sender: string;
    senderIp: string | null;
    content: string;
    attachments?: unknown | null;
    parentMessageId?: number | null;
  },
) {
  const message = await insertPersonaChatMessage(env, {
    persona: params.persona,
    sender: params.sender,
    senderIp: params.senderIp,
    content: params.content,
    attachments: params.attachments ?? null,
    parentMessageId: params.parentMessageId ?? null,
  });

  // Notify parent message owner on reply
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
 */
export async function togglePersonaChatReaction(
  env: Env,
  params: { messageId: number; reactor: string; reactionType: string },
) {
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
 */
export async function getPersonaAddressForChatMessage(
  env: Env,
  messageId: number,
): Promise<`0x${string}` | null> {
  const row = await env.DB.prepare(
    `SELECT persona_address FROM persona_chat_messages WHERE id = ? AND is_deleted = 0`,
  )
    .bind(messageId)
    .first<{ persona_address: string } | null>();

  return row?.persona_address as `0x${string}` | null;
}

export const listPersonaChatMessagesService = queryPersonaChatMessages;
export const listPersonaChatReactionsService = queryPersonaChatReactions;
