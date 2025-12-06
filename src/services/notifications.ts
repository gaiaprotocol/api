import {
  NotificationRow,
  NotificationRowWithProfiles,
  NotificationUnreadCounterRow,
  ensureUnreadCounterRow,
  getUnreadCounterRow,
  insertNotificationWithUnreadCounter,
  listNotificationsByRecipient,
  markAllNotificationsReadWithCounter,
  markNotificationReadWithCounter,
} from "../db/notifications";

export interface Notification {
  id: number;

  // recipient 정보
  recipient: string;
  recipientNickname: string | null;
  recipientAvatarUrl: string | null;

  // actor 정보
  actor: string | null;
  actorType: string | null;
  actorNickname: string | null;
  actorAvatarUrl: string | null;

  // 기타 메타
  notificationType: string;
  targetId: string | null;
  metadata: any | null;
  isRead: boolean;
  readAt: number | null;
  createdAt: number;
}

export interface CreateNotificationInput {
  recipient: string;
  actor?: string | null;
  actorType?: string | null;
  notificationType: string;
  targetId?: string | null;
  metadata?: any | null;
}

export interface ListNotificationsOptions {
  limit?: number;
  offset?: number;
}

const nowUnix = () => Math.floor(Date.now() / 1000);

/**
 * Create a notification and increment unread counter (transaction-safe).
 */
export async function createNotification(
  db: D1Database,
  input: CreateNotificationInput,
): Promise<Notification> {
  const {
    recipient,
    actor = null,
    actorType = null,
    notificationType,
    targetId = null,
    metadata = null,
  } = input;

  if (!recipient) throw new Error("recipient is required");
  if (!notificationType) throw new Error("notificationType is required");

  const createdAt = nowUnix();
  const metadataJson = metadata != null ? JSON.stringify(metadata) : null;

  // We need Env for DB helpers, so wrap db into a fake Env-like object.
  const envLike = { DB: db } as Env;

  const row = await insertNotificationWithUnreadCounter(envLike, {
    recipient,
    actor,
    actorType,
    notificationType,
    targetId,
    metadataJson,
    createdAt,
  });

  // 생성 직후에는 profile JOIN 이 없으므로 nickname/avatar 는 null
  return mapRowToNotification(row);
}

/**
 * Convenience overload that takes Env directly.
 */
export async function createNotificationWithEnv(
  env: Env,
  input: CreateNotificationInput,
): Promise<Notification> {
  return createNotification(env.DB, input);
}

/**
 * Legacy helper: list notifications with offset-based pagination.
 */
export async function getNotifications(
  env: Env,
  recipient: string,
  options: ListNotificationsOptions = {},
): Promise<Notification[]> {
  const limit = Math.min(options.limit ?? 20, 100);
  const offset = options.offset ?? 0;

  const rows = await listNotificationsByRecipient(env, {
    recipient,
    limit,
    offset,
  });

  return rows.map(mapRowToNotification);
}

/**
 * Handler-friendly wrapper used by /notifications endpoint.
 * Currently uses offset-based pagination; if cursorCreatedAt is provided,
 * frontend should translate that to offset before calling this.
 */
export async function listNotificationsForRecipient(
  env: Env,
  params: {
    recipient: string;
    limit?: number;
    cursorCreatedAt?: number | null; // currently ignored; offset-style paging
    offset?: number;
  },
): Promise<{ items: Notification[] }> {
  const { recipient } = params;
  const limit = Math.min(params.limit ?? 20, 100);
  const offset = params.offset ?? 0;

  const rows = await listNotificationsByRecipient(env, {
    recipient,
    limit,
    offset,
  });

  return { items: rows.map(mapRowToNotification) };
}

/**
 * Get unread count based purely on the counter table.
 * If the row does not exist, it is initialized to 0.
 */
export async function getUnreadNotificationCount(
  env: Env,
  recipient: string,
): Promise<number> {
  const row: NotificationUnreadCounterRow | null = await getUnreadCounterRow(
    env,
    recipient,
  );
  if (row) return row.unread_count;

  const ts = nowUnix();
  await ensureUnreadCounterRow(env, recipient, ts);
  return 0;
}

/**
 * Alias used by handlers: getUnreadCount(env, recipient)
 */
export const getUnreadCount = getUnreadNotificationCount;

/**
 * Mark a single notification as read and decrement unread counter.
 * Handler-friendly signature.
 */
export async function markNotificationAsRead(
  env: Env,
  params: {
    recipient: string;
    notificationId: number;
    readAt?: number;
  },
): Promise<boolean> {
  const { recipient, notificationId } = params;
  const ts = params.readAt ?? nowUnix();

  return markNotificationReadWithCounter(env, {
    recipient,
    notificationId,
    readAt: ts,
  });
}

/**
 * Mark all notifications as read and zero unread counter.
 * Returns previous counter value (from counter table).
 *
 * Handler-friendly signature; upToCreatedAt is currently ignored
 * and all notifications for the recipient are marked as read.
 */
export async function markAllNotificationsAsRead(
  env: Env,
  params: {
    recipient: string;
    readAt?: number;
    upToCreatedAt?: number;
  },
): Promise<{ updated: boolean; unreadBefore: number }> {
  const { recipient } = params;

  const counter = await getUnreadCounterRow(env, recipient);
  const unreadBefore = counter?.unread_count ?? 0;

  if (unreadBefore === 0) {
    return { updated: false, unreadBefore: 0 };
  }

  const ts = params.readAt ?? nowUnix();
  await markAllNotificationsReadWithCounter(env, { recipient, readAt: ts });

  return { updated: true, unreadBefore };
}

/* ----------------- internal helpers ----------------- */

function mapRowToNotification(
  row: NotificationRow | NotificationRowWithProfiles,
): Notification {
  const withProfiles = row as NotificationRowWithProfiles;

  return {
    id: row.id,
    recipient: row.recipient,
    recipientNickname:
      typeof withProfiles.recipient_nickname === "string"
        ? withProfiles.recipient_nickname
        : null,
    recipientAvatarUrl:
      typeof withProfiles.recipient_avatar_url === "string"
        ? withProfiles.recipient_avatar_url
        : null,

    actor: row.actor,
    actorType: row.actor_type,
    actorNickname:
      typeof withProfiles.actor_nickname === "string"
        ? withProfiles.actor_nickname
        : null,
    actorAvatarUrl:
      typeof withProfiles.actor_avatar_url === "string"
        ? withProfiles.actor_avatar_url
        : null,

    notificationType: row.notification_type,
    targetId: row.target_id,
    metadata: row.metadata ? safeParseJSON(row.metadata) : null,
    isRead: row.is_read === 1,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

function safeParseJSON(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
