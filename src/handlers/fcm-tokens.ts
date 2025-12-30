import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';
import {
  deleteFcmToken,
  upsertFcmToken,
  type AppType,
} from '../db/fcm-tokens';
import { FCM_TOPIC_NOTICES, FcmService } from '../services/fcm';

/**
 * POST /fcm-tokens/register
 * FCM 토큰 등록 또는 갱신 및 토픽 구독
 *
 * Body:
 *  {
 *    token: string;      // FCM 등록 토큰
 *    platform?: string;  // 플랫폼 (web, android, ios) - 기본값: web
 *    app?: string;       // 앱 타입 (valhalla, personas) - 기본값: valhalla
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

    // 토큰이 너무 짧으면 거의 항상 잘못된 값(클라 버그/권한 미승인 등)
    if (fcmToken.length < 80) {
      return jsonWithCors({
        success: false,
        error: 'Token looks invalid (too short)'
      }, 400);
    }

    // DB에 토큰 저장 (app 포함)
    const row = await upsertFcmToken(env, {
      app: app as AppType,
      account,
      token: fcmToken,
      platform,
    });

    // notices 토픽에 구독
    let subscribed = false;
    try {
      const fcmService = new FcmService(env, app as AppType);
      subscribed = await fcmService.subscribeToTopic(fcmToken, FCM_TOPIC_NOTICES);
      console.log(`[FCM] Token subscription result: ${subscribed} (app: ${app})`);
    } catch (err) {
      console.error('[FCM] Failed to subscribe to topic:', err);
    }

    return jsonWithCors({
      success: true,
      saved: true,
      subscribed,
      token: {
        id: row.id,
        app: row.app,
        account: row.account,
        platform: row.platform,
        is_active: row.is_active,
      },
    }, 200);
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
 *    app?: string;       // 앱 타입 (valhalla, personas) - 기본값: valhalla
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

    // notices 토픽에서 구독 해제
    let unsubscribed = false;
    try {
      const fcmService = new FcmService(env, app as AppType);
      unsubscribed = await fcmService.unsubscribeFromTopic(fcmToken, FCM_TOPIC_NOTICES);
      console.log(`[FCM] Token unsubscription result: ${unsubscribed} (app: ${app})`);
    } catch (err) {
      console.error('[FCM] Failed to unsubscribe from topic:', err);
    }

    // DB에서 토큰 삭제
    const deleted = await deleteFcmToken(env, {
      account,
      token: fcmToken,
      app: app as AppType,
    });

    return jsonWithCors({ success: true, unsubscribed, deleted }, 200);
  } catch (err) {
    console.error('[handleUnregisterFcmToken] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
