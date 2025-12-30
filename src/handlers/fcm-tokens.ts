import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import {
  deleteFcmToken,
  upsertFcmToken,
} from '../db/fcm-tokens';

/**
 * POST /fcm-tokens/register
 * FCM 토큰 등록 또는 갱신
 *
 * Body:
 *  {
 *    token: string;      // FCM 등록 토큰
 *    platform?: string;  // 플랫폼 (web, android, ios) - 기본값: web
 *  }
 *
 * Response:
 *  { success: true }
 */
export async function handleRegisterFcmToken(request: Request, env: Env) {
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
    const account = payload.sub as string;

    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      token: z.string().min(1),
      platform: z.enum(['web', 'android', 'ios']).optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { token: fcmToken, platform = 'web' } = parsed.data;

    await upsertFcmToken(env, {
      account,
      token: fcmToken,
      platform,
    });

    return jsonWithCors({ success: true }, 200);
  } catch (err) {
    console.error('[handleRegisterFcmToken] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

/**
 * POST /fcm-tokens/unregister
 * FCM 토큰 삭제
 *
 * Body:
 *  { token: string }
 *
 * Response:
 *  { success: true }
 */
export async function handleUnregisterFcmToken(request: Request, env: Env) {
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
    const account = payload.sub as string;

    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      token: z.string().min(1),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { token: fcmToken } = parsed.data;

    await deleteFcmToken(env, {
      account,
      token: fcmToken,
    });

    return jsonWithCors({ success: true }, 200);
  } catch (err) {
    console.error('[handleUnregisterFcmToken] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
