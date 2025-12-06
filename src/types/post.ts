export type PersonaPostAttachments = Record<string, unknown>;

export interface PersonaPost {
  id: number;
  author: string; // Wallet address of the author

  // 작성자 프로필 정보 (profiles JOIN 결과)
  authorNickname: string | null;
  authorAvatarUrl: string | null;

  content: string;
  // DB: string | null (JSON), Domain: parsed object
  attachments: PersonaPostAttachments | null;

  parentPostId: number | null;
  repostOfId: number | null;
  quoteOfId: number | null;

  viewCount: number;
  likeCount: number;
  commentCount: number;
  repostCount: number;
  quoteCount: number;
  bookmarkCount: number;

  createdAt: number; // Unix timestamp (seconds)
  updatedAt: number | null;
}

export type PersonaPostRow = {
  id: number;
  author: string;

  content: string;
  attachments: string | null; // JSON string

  parent_post_id: number | null;
  repost_of_id: number | null;
  quote_of_id: number | null;

  view_count: number;
  like_count: number;
  comment_count: number;
  repost_count: number;
  quote_count: number;
  bookmark_count: number;

  created_at: number;
  updated_at: number | null;
};

// 프로필 JOIN 이 포함된 Row 타입
export type PersonaPostRowWithProfile = PersonaPostRow & {
  author_nickname: string | null;
  author_avatar_url: string | null;
};

export function rowToPersonaPost(
  row: PersonaPostRow | PersonaPostRowWithProfile,
): PersonaPost {
  let attachments: PersonaPostAttachments | null = null;

  if (row.attachments) {
    try {
      attachments = JSON.parse(row.attachments);
    } catch (err) {
      console.error("Failed to parse persona_post.attachments", err);
      attachments = null;
    }
  }

  let authorNickname: string | null = null;
  let authorAvatarUrl: string | null = null;

  // JOIN 된 경우에만 존재
  if ('author_nickname' in row) {
    authorNickname = row.author_nickname ?? null;
  }
  if ('author_avatar_url' in row) {
    authorAvatarUrl = row.author_avatar_url ?? null;
  }

  return {
    id: row.id,
    author: row.author,

    authorNickname,
    authorAvatarUrl,

    content: row.content,
    attachments,

    parentPostId: row.parent_post_id,
    repostOfId: row.repost_of_id,
    quoteOfId: row.quote_of_id,

    viewCount: row.view_count,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    repostCount: row.repost_count,
    quoteCount: row.quote_count,
    bookmarkCount: row.bookmark_count,

    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* -------- Views / Likes / Bookmarks (기존 그대로) -------- */

export interface PersonaPostView {
  postId: number; // references persona_posts.id
  viewerHash: string; // hashed viewer identifier
  lastViewedAt: number; // Unix timestamp (seconds)
}

export type PersonaPostViewRow = {
  post_id: number;
  viewer_hash: string;
  last_viewed_at: number;
};

export function rowToPersonaPostView(row: PersonaPostViewRow): PersonaPostView {
  return {
    postId: row.post_id,
    viewerHash: row.viewer_hash,
    lastViewedAt: row.last_viewed_at,
  };
}

export interface PersonaPostLike {
  postId: number;
  account: string;
  createdAt: number; // Unix timestamp (seconds)
}

export type PersonaPostLikeRow = {
  post_id: number;
  account: string;
  created_at: number;
};

export function rowToPersonaPostLike(row: PersonaPostLikeRow): PersonaPostLike {
  return {
    postId: row.post_id,
    account: row.account,
    createdAt: row.created_at,
  };
}

export interface PersonaPostBookmark {
  postId: number;
  account: string;
  createdAt: number; // Unix timestamp (seconds)
}

export type PersonaPostBookmarkRow = {
  post_id: number;
  account: string;
  created_at: number;
};

export function rowToPersonaPostBookmark(
  row: PersonaPostBookmarkRow
): PersonaPostBookmark {
  return {
    postId: row.post_id,
    account: row.account,
    createdAt: row.created_at,
  };
}
