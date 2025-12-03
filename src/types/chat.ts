export type PersonaChatMessage = {
  id: number;
  personaAddress: string;
  sender: string;           // EVM address
  senderIp: string | null;

  content: string;
  attachments: unknown | null;
  parentMessageId: number | null;

  createdAt: number;        // epoch seconds
  updatedAt: number | null;

  isDeleted: boolean;
  deletedAt: number | null;
};

export type PersonaChatReaction = {
  messageId: number;
  reactor: string;          // EVM address
  reactionType: string;     // 'heart', '👍', ...
  createdAt: number;
};

export type PersonaChatMessagesResponse = {
  messages: PersonaChatMessage[];
  nextCursor: number | null;
};

export type PersonaChatReactionsResponse = {
  reactions: PersonaChatReaction[];
  counts: Record<string, number>;
};

// DB row 타입
export interface PersonaChatMessageRow {
  id: number;
  persona_address: string;
  sender: string;
  sender_ip: string | null;
  content: string;
  attachments: string | null;
  parent_message_id: number | null;
  created_at: number;
  updated_at: number | null;
  is_deleted: number; // 0 or 1
  deleted_at: number | null;
}

export function rowToPersonaChatMessage(row: PersonaChatMessageRow): PersonaChatMessage {
  let attachments: unknown | null = null;

  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments);
    } catch {
      attachments = null;
    }
  }

  return {
    id: row.id,
    personaAddress: row.persona_address,
    sender: row.sender,
    senderIp: row.sender_ip,
    content: row.content,
    attachments,
    parentMessageId: row.parent_message_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted === 1,
    deletedAt: row.deleted_at,
  };
}

export interface PersonaChatReactionRow {
  message_id: number;
  reactor: string;
  reaction_type: string;
  created_at: number;
}

export function rowToPersonaChatReaction(row: PersonaChatReactionRow): PersonaChatReaction {
  return {
    messageId: row.message_id,
    reactor: row.reactor,
    reactionType: row.reaction_type,
    createdAt: row.created_at,
  };
}
