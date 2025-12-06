import {
  PersonaChatMessage,
  PersonaChatMessageJoinedRow,
  PersonaChatReaction,
  PersonaChatReactionRow,
  rowToPersonaChatMessage,
  rowToPersonaChatReaction,
} from "../../types/chat";

export const CHAT_MESSAGES_TABLE = "persona_chat_messages";
export const CHAT_REACTIONS_TABLE = "persona_chat_reactions";
export const PROFILES_TABLE = "profiles";

/**
 * 새 메시지 INSERT 후, profiles 와 조인까지 한 번에 가져오는 함수
 * (단일 쿼리)
 *
 * D1/SQLite 에서 CTE + RETURNING 이 지원된다는 전제입니다.
 * 만약 RETURNING 이 안 된다면, INSERT / SELECT 두 번으로 나눠야 합니다.
 */
export async function insertPersonaChatMessage(
  env: Env,
  params: {
    persona: `0x${string}`;
    sender: `0x${string}`;
    senderIp: string | null;
    content: string;
    attachments: unknown | null;
    parentMessageId: number | null;
  },
): Promise<PersonaChatMessage> {
  const attachmentsJson =
    params.attachments != null ? JSON.stringify(params.attachments) : null;

  // ✅ CTE 제거 + INSERT ... RETURNING + 서브쿼리로 profile 붙이기
  const row = await env.DB.prepare(
    `
    INSERT INTO ${CHAT_MESSAGES_TABLE}
      (persona_address, sender, sender_ip, content, attachments, parent_message_id)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING
      -- message 기본 필드
      id,
      persona_address,
      sender,
      sender_ip,
      content,
      attachments,
      parent_message_id,
      created_at,
      updated_at,
      is_deleted,
      deleted_at,

      -- sender 프로필 (profiles 테이블에서 서브쿼리로 가져오기)
      (SELECT account      FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_account,
      (SELECT nickname     FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_nickname,
      (SELECT bio          FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_bio,
      (SELECT avatar_url   FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_avatar_url,
      (SELECT banner_url   FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_banner_url,
      (SELECT social_links FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_social_links,
      (SELECT created_at   FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_created_at,
      (SELECT updated_at   FROM ${PROFILES_TABLE} WHERE account = sender) AS profile_updated_at
    `,
  )
    .bind(
      params.persona,
      params.sender,
      params.senderIp,
      params.content,
      attachmentsJson,
      params.parentMessageId,
    )
    .first<PersonaChatMessageJoinedRow | null>();

  if (!row) {
    throw new Error("Failed to insert chat message");
  }

  return rowToPersonaChatMessage(row);
}

/**
 * 단일 쿼리로 메시지 + 프로필을 함께 가져오는 목록 조회
 */
export async function queryPersonaChatMessages(
  env: Env,
  params: { persona: string; limit: number; offset: number },
): Promise<PersonaChatMessage[]> {
  const res = await env.DB.prepare(
    `
    SELECT
      m.id,
      m.persona_address,
      m.sender,
      m.sender_ip,
      m.content,
      m.attachments,
      m.parent_message_id,
      m.is_deleted,
      m.created_at,
      m.updated_at,
      p.account AS profile_account,
      p.nickname AS profile_nickname,
      p.bio AS profile_bio,
      p.avatar_url AS profile_avatar_url,
      p.banner_url AS profile_banner_url,
      p.social_links AS profile_social_links,
      p.created_at AS profile_created_at,
      p.updated_at AS profile_updated_at
    FROM ${CHAT_MESSAGES_TABLE} m
    LEFT JOIN ${PROFILES_TABLE} p
      ON p.account = m.sender
    WHERE m.persona_address = ?
      AND m.is_deleted = 0
    ORDER BY m.created_at ASC
    LIMIT ? OFFSET ?
    `,
  )
    .bind(params.persona, params.limit, params.offset)
    .all<PersonaChatMessageJoinedRow>();

  const rows = res.results ?? [];
  return rows.map(rowToPersonaChatMessage);
}

/**
 * messageId 로 persona_address 를 가져오는 헬퍼
 * (리액션 권한 체크 등에 사용)
 */
export async function getPersonaAddressForChatMessage(
  env: Env,
  messageId: number,
): Promise<`0x${string}` | null> {
  const row = await env.DB.prepare(
    `
    SELECT persona_address
    FROM ${CHAT_MESSAGES_TABLE}
    WHERE id = ? AND is_deleted = 0
    `,
  )
    .bind(messageId)
    .first<{ persona_address: string } | null>();

  if (!row) return null;
  return row.persona_address as `0x${string}`;
}

/**
 * 리액션 토글 (DB row 단위)
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
 * 리액션 목록 (필요하다면 여기에서도 profiles 조인을 걸 수 있음)
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
