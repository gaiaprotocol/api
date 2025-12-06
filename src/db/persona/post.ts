import {
  PersonaPost,
  PersonaPostAttachments,
  PersonaPostRowWithProfile,
  rowToPersonaPost
} from "../../types/post";

/**
 * Create a new persona post (root / comment / repost / quote).
 */
export interface CreatePersonaPostInput {
  author: string;
  authorIp?: string | null;
  content: string;
  attachments?: PersonaPostAttachments | null;
  parentPostId?: number | null;
  repostOfId?: number | null;
  quoteOfId?: number | null;
}

export async function insertPersonaPost(
  env: Env,
  input: CreatePersonaPostInput,
): Promise<PersonaPost> {
  const {
    author,
    authorIp = null,
    content,
    attachments = null,
    parentPostId = null,
    repostOfId = null,
    quoteOfId = null,
  } = input;

  const attachmentsJson =
    attachments === null || attachments === undefined
      ? null
      : JSON.stringify(attachments);

  const result = await env.DB.prepare(
    `
    INSERT INTO persona_posts (
      author,
      author_ip,
      content,
      attachments,
      parent_post_id,
      repost_of_id,
      quote_of_id,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
    `,
  )
    .bind(
      author,
      authorIp,
      content,
      attachmentsJson,
      parentPostId,
      repostOfId,
      quoteOfId,
    )
    .run();

  const postId = Number(result.meta.last_row_id);

  const batch: D1PreparedStatement[] = [];

  if (parentPostId != null) {
    batch.push(
      env.DB.prepare(
        `
        UPDATE persona_posts
        SET comment_count = comment_count + 1
        WHERE id = ?
        `,
      ).bind(parentPostId),
    );
  }

  if (repostOfId != null) {
    batch.push(
      env.DB.prepare(
        `
        UPDATE persona_posts
        SET repost_count = repost_count + 1
        WHERE id = ?
        `,
      ).bind(repostOfId),
    );
  }

  if (quoteOfId != null) {
    batch.push(
      env.DB.prepare(
        `
        UPDATE persona_posts
        SET quote_count = quote_count + 1
        WHERE id = ?
        `,
      ).bind(quoteOfId),
    );
  }

  if (batch.length > 0) {
    await env.DB.batch(batch);
  }

  // 생성된 포스트를 작성자 프로필 포함해서 다시 조회
  const row = await env.DB.prepare(
    `
    SELECT
      p.*,
      pr.nickname   AS author_nickname,
      pr.avatar_url AS author_avatar_url
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON pr.account = p.author
    WHERE p.id = ?
    `,
  )
    .bind(postId)
    .first<PersonaPostRowWithProfile>();

  if (!row) {
    throw new Error("Failed to fetch created post");
  }

  return rowToPersonaPost(row);
}

/**
 * Update a post – only author can update, soft-deleted posts cannot be modified.
 */
export interface UpdatePersonaPostInput {
  postId: number;
  author: string;
  authorIp?: string | null;
  content?: string;
  attachments?: PersonaPostAttachments | null;
}

export async function updatePersonaPostRow(
  env: Env,
  input: UpdatePersonaPostInput,
): Promise<PersonaPost | null> {
  const { postId, author, authorIp, content, attachments } = input;

  const sets: string[] = [];
  const params: any[] = [];

  if (authorIp !== undefined) {
    sets.push("author_ip = ?");
    params.push(authorIp);
  }

  if (content !== undefined) {
    sets.push("content = ?");
    params.push(content);
  }

  if (attachments !== undefined) {
    sets.push("attachments = ?");
    params.push(attachments === null ? null : JSON.stringify(attachments));
  }

  if (sets.length === 0) {
    throw new Error("Nothing to update");
  }

  sets.push("updated_at = strftime('%s','now')");

  const sql = `
    UPDATE persona_posts
    SET ${sets.join(", ")}
    WHERE id = ?
      AND author = ?
      AND is_deleted = 0
  `;

  params.push(postId, author);

  const res = await env.DB.prepare(sql).bind(...params).run();

  if ((res.meta.changes ?? 0) === 0) {
    return null;
  }

  const row = await env.DB.prepare(
    `
    SELECT
      p.*,
      pr.nickname   AS author_nickname,
      pr.avatar_url AS author_avatar_url
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON pr.account = p.author
    WHERE p.id = ?
    `,
  )
    .bind(postId)
    .first<PersonaPostRowWithProfile>();

  return row ? rowToPersonaPost(row) : null;
}

/**
 * Soft delete a post.
 */
export async function softDeletePersonaPostRow(
  env: Env,
  postId: number,
  author: string,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `
    UPDATE persona_posts
    SET is_deleted = 1,
        deleted_at = strftime('%s','now')
    WHERE id = ?
      AND author = ?
      AND is_deleted = 0
    `,
  )
    .bind(postId, author)
    .run();

  return (res.meta.changes ?? 0) > 0;
}

/**
 * Get single post by id (excluding soft-deleted).
 *  - 작성자 프로필 포함
 */
export async function getPersonaPostRowById(
  env: Env,
  postId: number,
): Promise<PersonaPost | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      p.*,
      pr.nickname   AS author_nickname,
      pr.avatar_url AS author_avatar_url
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON pr.account = p.author
    WHERE p.id = ?
      AND p.is_deleted = 0
    `,
  )
    .bind(postId)
    .first<PersonaPostRowWithProfile>();

  return row ? rowToPersonaPost(row) : null;
}

/**
 * List posts for timeline / profile / replies.
 *  - 작성자 프로필 포함
 */
export interface ListPersonaPostsOptions {
  author?: string;
  parentPostId?: number;
  limit?: number;
  offset?: number;
}

export async function listPersonaPostRows(
  env: Env,
  options: ListPersonaPostsOptions = {},
): Promise<PersonaPost[]> {
  const { author, parentPostId, limit = 20, offset = 0 } = options;

  const where: string[] = ["p.is_deleted = 0"];
  const params: any[] = [];

  if (author) {
    where.push("p.author = ?");
    params.push(author);
  }

  if (parentPostId !== undefined) {
    where.push("p.parent_post_id = ?");
    params.push(parentPostId);
  }

  const sql = `
    SELECT
      p.*,
      pr.nickname   AS author_nickname,
      pr.avatar_url AS author_avatar_url
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON pr.account = p.author
    WHERE ${where.join(" AND ")}
    ORDER BY p.created_at DESC
    LIMIT ?
    OFFSET ?
  `;

  params.push(limit, offset);

  const rows = await env.DB.prepare(sql)
    .bind(...params)
    .all<PersonaPostRowWithProfile>();

  return (rows.results ?? []).map(rowToPersonaPost);
}

/**
 * Get a post with its direct replies.
 *  - post / replies 모두 작성자 프로필 포함
 */
export async function getPersonaPostRowWithReplies(
  env: Env,
  postId: number,
): Promise<{ post: PersonaPost; replies: PersonaPost[] } | null> {
  const post = await getPersonaPostRowById(env, postId);
  if (!post) return null;

  const replyRows = await env.DB.prepare(
    `
    SELECT
      p.*,
      pr.nickname   AS author_nickname,
      pr.avatar_url AS author_avatar_url
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON pr.account = p.author
    WHERE p.parent_post_id = ?
      AND p.is_deleted = 0
    ORDER BY p.created_at ASC
    `,
  )
    .bind(postId)
    .all<PersonaPostRowWithProfile>();

  const replies = (replyRows.results ?? []).map(rowToPersonaPost);

  return { post, replies };
}

/**
 * Like / unlike / bookmark / unbookmark helpers.
 */

export async function likePersonaPostRow(
  env: Env,
  postId: number,
  account: string,
): Promise<boolean> {
  const insert = await env.DB.prepare(
    `
    INSERT OR IGNORE INTO persona_post_likes (post_id, account)
    VALUES (?, ?)
    `,
  )
    .bind(postId, account)
    .run();

  if ((insert.meta.changes ?? 0) === 1) {
    await env.DB.prepare(
      `
      UPDATE persona_posts
      SET like_count = like_count + 1
      WHERE id = ?
      `,
    )
      .bind(postId)
      .run();

    return true;
  }
  return false;
}

export async function unlikePersonaPostRow(
  env: Env,
  postId: number,
  account: string,
): Promise<boolean> {
  const del = await env.DB.prepare(
    `
    DELETE FROM persona_post_likes
    WHERE post_id = ?
      AND account = ?
    `,
  )
    .bind(postId, account)
    .run();

  if ((del.meta.changes ?? 0) === 1) {
    await env.DB.prepare(
      `
      UPDATE persona_posts
      SET like_count =
        CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END
      WHERE id = ?
      `,
    )
      .bind(postId)
      .run();

    return true;
  }
  return false;
}

export async function bookmarkPersonaPostRow(
  env: Env,
  postId: number,
  account: string,
): Promise<boolean> {
  const insert = await env.DB.prepare(
    `
    INSERT OR IGNORE INTO persona_post_bookmarks (post_id, account)
    VALUES (?, ?)
    `,
  )
    .bind(postId, account)
    .run();

  if ((insert.meta.changes ?? 0) === 1) {
    await env.DB.prepare(
      `
      UPDATE persona_posts
      SET bookmark_count = bookmark_count + 1
      WHERE id = ?
      `,
    )
      .bind(postId)
      .run();

    return true;
  }
  return false;
}

export async function unbookmarkPersonaPostRow(
  env: Env,
  postId: number,
  account: string,
): Promise<boolean> {
  const del = await env.DB.prepare(
    `
    DELETE FROM persona_post_bookmarks
    WHERE post_id = ?
      AND account = ?
    `,
  )
    .bind(postId, account)
    .run();

  if ((del.meta.changes ?? 0) === 1) {
    await env.DB.prepare(
      `
      UPDATE persona_posts
      SET bookmark_count =
        CASE WHEN bookmark_count > 0 THEN bookmark_count - 1 ELSE 0 END
      WHERE id = ?
      `,
    )
      .bind(postId)
      .run();

    return true;
  }
  return false;
}
