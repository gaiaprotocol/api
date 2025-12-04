export const NOTIFICATIONS_TABLE = "notifications";
export const NOTIFICATION_COUNTERS_TABLE = "notification_unread_counters";

export interface NotificationRow {
  id: number;
  recipient: string;
  actor: string | null;
  actor_type: string | null;
  notification_type: string;
  target_id: string | null;
  metadata: string | null;
  is_read: number;
  read_at: number | null;
  created_at: number;
}

export interface NotificationUnreadCounterRow {
  recipient: string;
  unread_count: number;
  updated_at: number;
}

/**
 * Insert a notification and increment unread counter in a single transaction.
 * Returns the inserted row.
 */
export async function insertNotificationWithUnreadCounter(
  env: Env,
  params: {
    recipient: string;
    actor: string | null;
    actorType: string | null;
    notificationType: string;
    targetId: string | null;
    metadataJson: string | null;
    createdAt: number;
  },
): Promise<NotificationRow> {
  const {
    recipient,
    actor,
    actorType,
    notificationType,
    targetId,
    metadataJson,
    createdAt,
  } = params;

  const insertStmt = env.DB.prepare(
    `
    INSERT INTO ${NOTIFICATIONS_TABLE} (
      recipient,
      actor,
      actor_type,
      notification_type,
      target_id,
      metadata,
      is_read,
      read_at,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
    RETURNING *
    `,
  ).bind(
    recipient,
    actor,
    actorType,
    notificationType,
    targetId,
    metadataJson,
    createdAt,
  );

  const counterStmt = env.DB.prepare(
    `
    INSERT INTO ${NOTIFICATION_COUNTERS_TABLE} (recipient, unread_count, updated_at)
    VALUES (?, 1, ?)
    ON CONFLICT(recipient) DO UPDATE SET
      unread_count = ${NOTIFICATION_COUNTERS_TABLE}.unread_count + 1,
      updated_at   = excluded.updated_at
    `,
  ).bind(recipient, createdAt);

  const [insertRes] = await env.DB.batch<NotificationRow | unknown>([
    insertStmt,
    counterStmt,
  ]);

  const row = (insertRes.results?.[0] ?? null) as NotificationRow | null;
  if (!row) {
    throw new Error("Failed to insert notification");
  }

  return row;
}

/**
 * List notifications for a recipient, newest first.
 */
export async function listNotificationsByRecipient(
  env: Env,
  params: { recipient: string; limit: number; offset: number },
): Promise<NotificationRow[]> {
  const { recipient, limit, offset } = params;

  const res = await env.DB.prepare(
    `
    SELECT *
    FROM ${NOTIFICATIONS_TABLE}
    WHERE recipient = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ? OFFSET ?
    `,
  )
    .bind(recipient, limit, offset)
    .all<NotificationRow>();

  return res.results ?? [];
}

/**
 * Get unread counter row for a recipient, or null if none exists.
 */
export async function getUnreadCounterRow(
  env: Env,
  recipient: string,
): Promise<NotificationUnreadCounterRow | null> {
  const row = await env.DB.prepare(
    `
    SELECT recipient, unread_count, updated_at
    FROM ${NOTIFICATION_COUNTERS_TABLE}
    WHERE recipient = ?
    `,
  )
    .bind(recipient)
    .first<NotificationUnreadCounterRow | null>();

  return row ?? null;
}

/**
 * Ensure unread counter row exists; if not, insert with 0.
 */
export async function ensureUnreadCounterRow(
  env: Env,
  recipient: string,
  timestamp: number,
): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO ${NOTIFICATION_COUNTERS_TABLE} (recipient, unread_count, updated_at)
    VALUES (?, 0, ?)
    ON CONFLICT(recipient) DO NOTHING
    `,
  )
    .bind(recipient, timestamp)
    .run();
}

/**
 * Mark a single notification as read and decrement unread counter
 * in a single transaction. Returns true if a row was updated.
 */
export async function markNotificationReadWithCounter(
  env: Env,
  params: { recipient: string; notificationId: number; readAt: number },
): Promise<boolean> {
  const { recipient, notificationId, readAt } = params;

  const counterStmt = env.DB.prepare(
    `
    UPDATE ${NOTIFICATION_COUNTERS_TABLE}
    SET
      unread_count = CASE
        WHEN unread_count > 0 THEN unread_count - 1
        ELSE 0
      END,
      updated_at = ?
    WHERE recipient = ?
      AND EXISTS (
        SELECT 1
        FROM ${NOTIFICATIONS_TABLE}
        WHERE id = ?
          AND recipient = ?
          AND is_read = 0
      )
    `,
  ).bind(readAt, recipient, notificationId, recipient);

  const notifStmt = env.DB.prepare(
    `
    UPDATE ${NOTIFICATIONS_TABLE}
    SET is_read = 1,
        read_at = ?
    WHERE id = ?
      AND recipient = ?
      AND is_read = 0
    `,
  ).bind(readAt, notificationId, recipient);

  const [counterRes, notifRes] = await env.DB.batch([
    counterStmt,
    notifStmt,
  ]);

  const counterChanged = Number(counterRes.meta?.changes ?? 0);
  const notifChanged = Number(notifRes.meta?.changes ?? 0);

  return counterChanged > 0 && notifChanged > 0;
}

/**
 * Mark all notifications as read and set unread counter to 0
 * in a single transaction.
 */
export async function markAllNotificationsReadWithCounter(
  env: Env,
  params: { recipient: string; readAt: number },
): Promise<void> {
  const { recipient, readAt } = params;

  const notifStmt = env.DB.prepare(
    `
    UPDATE ${NOTIFICATIONS_TABLE}
    SET is_read = 1,
        read_at = ?
    WHERE recipient = ?
      AND is_read = 0
    `,
  ).bind(readAt, recipient);

  const counterStmt = env.DB.prepare(
    `
    UPDATE ${NOTIFICATION_COUNTERS_TABLE}
    SET unread_count = 0,
        updated_at   = ?
    WHERE recipient = ?
    `,
  ).bind(readAt, recipient);

  await env.DB.batch([notifStmt, counterStmt]);
}
