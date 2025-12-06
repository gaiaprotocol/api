export type Profile = {
  account: string;
  nickname: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  socialLinks: string | null;
  createdAt: number | null;
  updatedAt: number | null;
};

export type PersonaChatMessage = {
  id: number;
  personaAddress: `0x${string}`;
  sender: `0x${string}`;
  senderIp: string | null;
  content: string;
  attachments: unknown | null;
  parentMessageId: number | null;
  isDeleted: boolean;
  createdAt: number;
  updatedAt: number | null;

  /** 새로 추가된 필드: 프로필 정보 (없으면 null) */
  senderProfile: Profile | null;
};

export type PersonaChatReaction = {
  messageId: number;
  reactor: `0x${string}`;
  reactionType: string;
  createdAt: number;

  /** 선택사항: 리액션 한 유저의 프로필을 넣고 싶다면 */
  reactorProfile?: Profile | null;
};

/**
 * DB에서 persona_chat_messages + profiles 를 조인해서 가져오는 Row 타입
 * (컬럼 이름에 alias 사용)
 */
export type PersonaChatMessageJoinedRow = {
  id: number;
  persona_address: string;
  sender: string;
  sender_ip: string | null;
  content: string;
  attachments: string | null; // JSON string
  parent_message_id: number | null;
  is_deleted: number;
  created_at: number;
  updated_at: number | null;

  // profiles 조인 결과
  profile_account: string | null;
  profile_nickname: string | null;
  profile_bio: string | null;
  profile_avatar_url: string | null;
  profile_banner_url: string | null;
  profile_social_links: string | null;
  profile_created_at: number | null;
  profile_updated_at: number | null;
};

export type PersonaChatReactionRow = {
  message_id: number;
  reactor: string;
  reaction_type: string;
  created_at: number;
};

/** Row → Domain 변환 (메시지 + 프로필) */
export function rowToPersonaChatMessage(
  row: PersonaChatMessageJoinedRow,
): PersonaChatMessage {
  let attachments: unknown = null;
  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments);
    } catch {
      attachments = null;
    }
  }

  const hasProfile = !!row.profile_account;

  return {
    id: row.id,
    personaAddress: row.persona_address as `0x${string}`,
    sender: row.sender as `0x${string}`,
    senderIp: row.sender_ip,
    content: row.content,
    attachments,
    parentMessageId: row.parent_message_id,
    isDeleted: row.is_deleted === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    senderProfile: hasProfile
      ? {
        account: row.profile_account!,
        nickname: row.profile_nickname,
        bio: row.profile_bio,
        avatarUrl: row.profile_avatar_url,
        bannerUrl: row.profile_banner_url,
        socialLinks: row.profile_social_links,
        createdAt: row.profile_created_at,
        updatedAt: row.profile_updated_at,
      }
      : null,
  };
}

/** Row → Domain 변환 (리액션) */
export function rowToPersonaChatReaction(
  row: PersonaChatReactionRow,
): PersonaChatReaction {
  return {
    messageId: row.message_id,
    reactor: row.reactor as `0x${string}`,
    reactionType: row.reaction_type,
    createdAt: row.created_at,
  };
}
