import { PersonaPostRow, rowToPersonaPost } from "../types/post";

export async function getPostWithReplies(env: Env, postId: number) {
  // 메인 포스트
  const postRow = await env.DB.prepare(
    `
    SELECT
      p.*,
      pr.account,
      pr.nickname,
      pr.bio,
      pr.avatar_url,
      pr.banner_url,
      pr.social_links,
      pr.created_at as profile_created_at,
      pr.updated_at as profile_updated_at
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON p.author = pr.account
    WHERE p.id = ?
    `
  )
    .bind(postId)
    .first<PersonaPostRow>();

  if (!postRow) return null;

  const post = rowToPersonaPost(postRow);

  // 댓글(자식 포스트)
  const replyRows = await env.DB.prepare(
    `
    SELECT
      p.*,
      pr.account,
      pr.nickname,
      pr.bio,
      pr.avatar_url,
      pr.banner_url,
      pr.social_links,
      pr.created_at as profile_created_at,
      pr.updated_at as profile_updated_at
    FROM persona_posts p
    LEFT JOIN profiles pr
      ON p.author = pr.account
    WHERE p.parent_post_id = ?
    ORDER BY p.created_at ASC
    `
  )
    .bind(postId)
    .all<PersonaPostRow>();

  const replyPosts = replyRows.results.map(rowToPersonaPost);

  return { post, replyPosts };
}
