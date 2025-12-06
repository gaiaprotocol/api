import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import {
  getUnreadCount,
  listNotificationsForRecipient,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../services/notifications';

/**
 * GET /notifications
 * List notifications for the authenticated user.
 *
 * Query params:
 *  - limit?: number (default 20, max 100)
 *  - cursor?: number (UNIX seconds, created_at of last item from previous page)
 *
 * Response:
 *  {
 *    notifications: Array<{
 *      id: number;
 *      recipient: string;
 *      recipientNickname: string | null;
 *      recipientAvatarUrl: string | null;
 *      actor: string | null;
 *      actorType: string | null;
 *      actorNickname: string | null;
 *      actorAvatarUrl: string | null;
 *      notificationType: string;
 *      targetId: string | null;
 *      metadata: any | null;
 *      isRead: boolean;
 *      readAt: number | null;
 *      createdAt: number;
 *    }>,
 *    nextCursor: number | null,
 *    unreadCount: number
 *  }
 */
export async function handleListNotifications(request: Request, env: Env) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    const payload: any = await verifyToken(token, env).catch(() => null);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid or expired token.' }, 401);
    }
    const recipient = payload.sub as string;

    const url = new URL(request.url);

    const schema = z.object({
      limit: z.coerce.number().int().positive().max(100).optional(),
      cursor: z
        .coerce
        .number()
        .int()
        .min(0)
        .optional(),
    });

    const parsed = schema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    });

    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { limit = 20, cursor } = parsed.data;

    const { items } = await listNotificationsForRecipient(env, {
      recipient,
      limit,
      cursorCreatedAt: cursor ?? null,
      // 현재는 offset 기반이지만, 외부에서 offset 으로 변환해서 넘기는 식으로 사용 가능
    });

    const nextCursor =
      items.length < limit ? null : items[items.length - 1]!.createdAt;

    const unreadCount = await getUnreadCount(env, recipient);

    return jsonWithCors(
      {
        notifications: items,
        nextCursor,
        unreadCount,
      },
      200,
    );
  } catch (err) {
    console.error('[handleListNotifications] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

/**
 * GET /notifications/unread-count
 * Returns only unread notification count for the authenticated user.
 *
 * Response:
 *  { unreadCount: number }
 */
export async function handleUnreadNotificationCount(
  request: Request,
  env: Env,
) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    const payload: any = await verifyToken(token, env).catch(() => null);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid or expired token.' }, 401);
    }
    const recipient = payload.sub as string;

    const unreadCount = await getUnreadCount(env, recipient);
    return jsonWithCors({ unreadCount }, 200);
  } catch (err) {
    console.error('[handleUnreadNotificationCount] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

/**
 * POST /notifications/mark-read
 * Mark a single notification as read.
 *
 * Body:
 *  { id: number }
 *
 * Response:
 *  { ok: true, unreadCount: number }
 */
export async function handleMarkNotificationRead(
  request: Request,
  env: Env,
) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    const payload: any = await verifyToken(token, env).catch(() => null);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid or expired token.' }, 401);
    }
    const recipient = payload.sub as string;

    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      id: z.number().int().positive(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { id } = parsed.data;
    const now = Math.floor(Date.now() / 1000);

    await markNotificationAsRead(env, {
      recipient,
      notificationId: id,
      readAt: now,
    });

    const unreadCount = await getUnreadCount(env, recipient);

    return jsonWithCors({ ok: true, unreadCount }, 200);
  } catch (err) {
    console.error('[handleMarkNotificationRead] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

/**
 * POST /notifications/mark-all-read
 * Mark all notifications as read up to a given timestamp.
 *
 * Body (optional):
 *  { upToCreatedAt?: number }  // UNIX seconds; default = now
 *
 * Response:
 *  { ok: true, unreadCount: number }
 */
export async function handleMarkAllNotificationsRead(
  request: Request,
  env: Env,
) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    const payload: any = await verifyToken(token, env).catch(() => null);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid or expired token.' }, 401);
    }
    const recipient = payload.sub as string;

    const body = await request.json().catch(() => ({} as any));

    const schema = z.object({
      upToCreatedAt: z.number().int().positive().optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { upToCreatedAt } = parsed.data;
    const now = Math.floor(Date.now() / 1000);

    await markAllNotificationsAsRead(env, {
      recipient,
      readAt: now,
      upToCreatedAt: upToCreatedAt ?? now,
    });

    const unreadCount = await getUnreadCount(env, recipient);

    return jsonWithCors({ ok: true, unreadCount }, 200);
  } catch (err) {
    console.error('[handleMarkAllNotificationsRead] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
