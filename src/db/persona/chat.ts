export const CHAT_MESSAGES_TABLE = 'persona_chat_messages';
export const CHAT_REACTIONS_TABLE = 'persona_chat_reactions';

export async function createPersonaChatMessage(env: Env, params: {
  persona: string;
  sender: string;
  senderIp: string | null;
  content: string;
  attachments: unknown | null;
  parentMessageId: number | null;
}) {
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
    .first();

  if (!row) throw new Error('Failed to insert chat message');

  if (row.attachments) {
    try { row.attachments = JSON.parse(row.attachments as string); } catch { /* ignore */ }
  }

  return row;
}

export async function listPersonaChatMessages(env: Env, params: {
  persona: string;
  limit: number;
  offset: number;
}) {
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
    .all<any>();

  const messages =
    res.results?.map((r) => ({
      ...r,
      attachments: r.attachments ? JSON.parse(r.attachments) : null,
    })) ?? [];

  return messages;
}

export async function togglePersonaChatReaction(env: Env, params: {
  messageId: number;
  reactor: string;
  reactionType: string;
}) {
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

    return 'removed' as const;
  }

  await env.DB.prepare(
    `
    INSERT INTO ${CHAT_REACTIONS_TABLE} (message_id, reactor, reaction_type)
    VALUES (?, ?, ?)
    `,
  )
    .bind(params.messageId, params.reactor, params.reactionType)
    .run();

  return 'added' as const;
}

export async function listPersonaChatReactions(env: Env, messageId: number) {
  const res = await env.DB.prepare(
    `
    SELECT reactor, reaction_type, created_at
    FROM ${CHAT_REACTIONS_TABLE}
    WHERE message_id = ?
    ORDER BY created_at ASC
    `,
  )
    .bind(messageId)
    .all<{ reactor: string; reaction_type: string; created_at: number }>();

  const reactions = res.results ?? [];
  const counts: Record<string, number> = {};

  for (const r of reactions) {
    counts[r.reaction_type] = (counts[r.reaction_type] || 0) + 1;
  }

  return { reactions, counts };
}
