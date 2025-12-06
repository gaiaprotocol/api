import {
  bookmarkPersonaPostRow,
  CreatePersonaPostInput,
  getPersonaPostRowById,
  getPersonaPostRowWithReplies,
  insertPersonaPost,
  likePersonaPostRow,
  listPersonaPostRows,
  softDeletePersonaPostRow,
  unbookmarkPersonaPostRow,
  unlikePersonaPostRow,
  updatePersonaPostRow,
} from "../../db/persona/post";
import { createNotificationWithEnv } from "../notifications";

/**
 * Create a post and emit appropriate notifications.
 *  - 반환되는 post 에는 authorNickname / authorAvatarUrl 포함
 */
export async function createPersonaPostService(
  env: Env,
  input: CreatePersonaPostInput,
) {
  const post = await insertPersonaPost(env, input);
  const actor = input.author;

  // Notify parent post owner on comment
  if (input.parentPostId) {
    const parent = await getPersonaPostRowById(env, input.parentPostId);
    if (parent && parent.author !== actor) {
      await createNotificationWithEnv(env, {
        recipient: parent.author,
        actor,
        actorType: "wallet",
        notificationType: "post.reply",
        targetId: String(parent.id),
        metadata: { postId: parent.id, commentId: post.id },
      });
    }
  }

  // Notify original author on repost
  if (input.repostOfId) {
    const original = await getPersonaPostRowById(env, input.repostOfId);
    if (original && original.author !== actor) {
      await createNotificationWithEnv(env, {
        recipient: original.author,
        actor,
        actorType: "wallet",
        notificationType: "post.repost",
        targetId: String(original.id),
        metadata: { postId: original.id, repostId: post.id },
      });
    }
  }

  // Notify original author on quote
  if (input.quoteOfId) {
    const original = await getPersonaPostRowById(env, input.quoteOfId);
    if (original && original.author !== actor) {
      await createNotificationWithEnv(env, {
        recipient: original.author,
        actor,
        actorType: "wallet",
        notificationType: "post.quote",
        targetId: String(original.id),
        metadata: { postId: original.id, quoteId: post.id },
      });
    }
  }

  return post;
}

/**
 * Update / delete wrappers (no notifications for now).
 *  - update 시에도 authorNickname / authorAvatarUrl 포함된 post 반환
 */
export const updatePersonaPostService = updatePersonaPostRow;
export const softDeletePersonaPostService = softDeletePersonaPostRow;
export const getPersonaPostByIdService = getPersonaPostRowById;
export const listPersonaPostsService = listPersonaPostRows;
export const getPersonaPostWithRepliesService = getPersonaPostRowWithReplies;

/**
 * Likes and bookmarks, with notifications where appropriate.
 */
export async function likePersonaPostService(
  env: Env,
  postId: number,
  account: string,
) {
  const changed = await likePersonaPostRow(env, postId, account);
  if (!changed) return;

  const post = await getPersonaPostRowById(env, postId);
  if (post && post.author !== account) {
    await createNotificationWithEnv(env, {
      recipient: post.author,
      actor: account,
      actorType: "wallet",
      notificationType: "post.like",
      targetId: String(postId),
      metadata: { postId },
    });
  }
}

export async function unlikePersonaPostService(
  env: Env,
  postId: number,
  account: string,
) {
  await unlikePersonaPostRow(env, postId, account);
}

// Bookmarks typically don't generate notifications.
export const bookmarkPersonaPostService = bookmarkPersonaPostRow;
export const unbookmarkPersonaPostService = unbookmarkPersonaPostRow;
