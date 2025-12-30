import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import {
  deleteFcmToken,
  upsertFcmToken,
} from '../db/fcm-tokens';
import { FCM_TOPICS, FcmService } from '../services/fcm';

/**
 * POST /fcm-tokens/register
 * FCM 토큰 등록 또는 갱신 및 토픽 구독
 *
 * Body:
 *  {
 *    token: string;      // FCM 등록 토큰
 *    platform?: string;  // 플랫폼 (web, android, ios) - 기본값: web
 *    app?: string;       // 앱 이름 (valhalla, personas) - 기본값: valhalla
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
      app: z.enum(['valhalla', 'personas']).optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { token: fcmToken, platform = 'web', app = 'valhalla' } = parsed.data;

    // DB에 토큰 저장
    await upsertFcmToken(env, {
      account,
      token: fcmToken,
      platform,
    });

    // 토픽에 구독
    const topic = app === 'personas'
      ? FCM_TOPICS.PERSONAS_NOTICES
      : FCM_TOPICS.VALHALLA_NOTICES;

    try {
      const fcmService = new FcmService(env);
      await fcmService.subscribeToTopic(fcmToken, topic);
      console.log(`[FCM] Token subscribed to topic: ${topic}`);
    } catch (err) {
      console.error('[FCM] Failed to subscribe to topic:', err);
      // 토픽 구독 실패해도 토큰 등록은 성공으로 처리
    }

    return jsonWithCors({ success: true }, 200);
  } catch (err) {
    console.error('[handleRegisterFcmToken] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

/**
 * POST /fcm-tokens/unregister
 * FCM 토큰 삭제 및 토픽 구독 해제
 *
 * Body:
 *  {
 *    token: string;
 *    app?: string;  // 앱 이름 (valhalla, personas) - 기본값: valhalla
 *  }
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
      app: z.enum(['valhalla', 'personas']).optional(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { token: fcmToken, app = 'valhalla' } = parsed.data;

    // 토픽에서 구독 해제
    const topic = app === 'personas'
      ? FCM_TOPICS.PERSONAS_NOTICES
      : FCM_TOPICS.VALHALLA_NOTICES;

    try {
      const fcmService = new FcmService(env);
      await fcmService.unsubscribeFromTopic(fcmToken, topic);
      console.log(`[FCM] Token unsubscribed from topic: ${topic}`);
    } catch (err) {
      console.error('[FCM] Failed to unsubscribe from topic:', err);
    }

    // DB에서 토큰 삭제
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
