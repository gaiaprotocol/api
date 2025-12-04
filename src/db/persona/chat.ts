import {
  PersonaChatMessage,
  PersonaChatMessageRow,
  PersonaChatReaction,
  PersonaChatReactionRow,
  rowToPersonaChatMessage,
  rowToPersonaChatReaction,
} from "../../types/chat";

export const CHAT_MESSAGES_TABLE = "persona_chat_messages";
export const CHAT_REACTIONS_TABLE = "persona_chat_reactions";

/**
 * Insert a new persona chat message.
 */
export async function insertPersonaChatMessage(
  env: Env,
  params: {
    persona: string;
    sender: string;
    senderIp: string | null;
    content: string;
    attachments: unknown | null;
    parentMessageId: number | null;
  },
): Promise<PersonaChatMessage> {
  const row = await env.DB.prepare(
    `
    INSERT INTO ${CHAT_MESSAGES_TABLE}
      (persona_address, sender, sender_ip, content, attachments, parent_message_id)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING *
    `,
  )
    .bind(
      params.persona,
      params.sender,
      params.senderIp,
      params.content,
      params.attachments ? JSON.stringify(params.attachments) : null,
      params.parentMessageId,
    )
    .first<PersonaChatMessageRow | null>();

  if (!row) throw new Error("Failed to insert chat message");

  return rowToPersonaChatMessage(row);
}

/**
 * List chat messages in a persona room.
 */
export async function queryPersonaChatMessages(
  env: Env,
  params: { persona: string; limit: number; offset: number },
): Promise<PersonaChatMessage[]> {
  const res = await env.DB.prepare(
    `
    SELECT *
    FROM ${CHAT_MESSAGES_TABLE}
    WHERE persona_address = ?
      AND is_deleted = 0
    ORDER BY created_at ASC
    LIMIT ? OFFSET ?
    `,
  )
    .bind(params.persona, params.limit, params.offset)
    .all<PersonaChatMessageRow>();

  const rows = res.results ?? [];
  return rows.map(rowToPersonaChatMessage);
}

/**
 * Toggle a reaction row for a chat message.
 * Returns 'added' or 'removed'.
 */
export async function togglePersonaChatReactionRow(
  env: Env,
  params: { messageId: number; reactor: string; reactionType: string },
): Promise<"added" | "removed"> {
  const existing = await env.DB.prepare(
    `
    SELECT 1
    FROM ${CHAT_REACTIONS_TABLE}
    WHERE message_id = ? AND reactor = ? AND reaction_type = ?
    `,
  )
    .bind(params.messageId, params.reactor, params.reactionType)
    .first();

  if (existing) {
    await env.DB.prepare(
      `
      DELETE FROM ${CHAT_REACTIONS_TABLE}
      WHERE message_id = ? AND reactor = ? AND reaction_type = ?
      `,
    )
      .bind(params.messageId, params.reactor, params.reactionType)
      .run();

    return "removed";
  }

  await env.DB.prepare(
    `
    INSERT INTO ${CHAT_REACTIONS_TABLE} (message_id, reactor, reaction_type)
    VALUES (?, ?, ?)
    `,
  )
    .bind(params.messageId, params.reactor, params.reactionType)
    .run();

  return "added";
}

/**
 * List reactions of a message and aggregated counts.
 */
export async function queryPersonaChatReactions(
  env: Env,
  messageId: number,
): Promise<{ reactions: PersonaChatReaction[]; counts: Record<string, number> }> {
  const res = await env.DB.prepare(
    `
    SELECT message_id, reactor, reaction_type, created_at
    FROM ${CHAT_REACTIONS_TABLE}
    WHERE message_id = ?
    ORDER BY created_at ASC
    `,
  )
    .bind(messageId)
    .all<PersonaChatReactionRow>();

  const rows = res.results ?? [];
  const reactions: PersonaChatReaction[] = rows.map(rowToPersonaChatReaction);

  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.reactionType] = (counts[r.reactionType] || 0) + 1;
  }

  return { reactions, counts };
}
