import { EnhancedFcmMessage, FCM, FcmOptions } from 'fcm-cloudflare-workers';
import { deactivateFcmToken, getAllActiveFcmTokens } from '../db/fcm-tokens';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, string>;
  clickAction?: string;
}

/**
 * FCM 푸시 알림 전송 서비스
 */
export class FcmService {
  #fcm: FCM;
  #env: Env;

  constructor(env: Env) {
    this.#env = env;
    const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const fcmOptions = new FcmOptions({
      serviceAccount,
      kvStore: env.FCM_TOKEN_CACHE,
      kvCacheKey: 'fcm_access_token',
    });
    this.#fcm = new FCM(fcmOptions);
  }

  /**
   * 단일 토큰으로 푸시 알림 전송
   */
  async sendToToken(token: string, payload: PushNotificationPayload): Promise<boolean> {
    const message: EnhancedFcmMessage = {
      notification: {
        title: payload.title,
        body: payload.body,
        image: payload.icon,
      },
      data: payload.data,
      android: {
        notification: {
          click_action: payload.clickAction || 'OPEN_APP',
          channel_id: 'notices',
          icon: 'notification_icon',
        },
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
          },
        },
      },
      webpush: {
        notification: {
          icon: payload.icon || '/images/icon-192x192.png',
          badge: payload.badge || '/images/icon-192x192.png',
        },
        fcm_options: {
          link: payload.clickAction || '/',
        },
      },
    };

    try {
      await this.#fcm.sendToToken(message, token);
      return true;
    } catch (err: any) {
      console.error(`[FCM] Failed to send to token: ${token}`, err);

      // 토큰이 유효하지 않은 경우 비활성화
      if (
        err?.message?.includes('Requested entity was not found') ||
        err?.message?.includes('not a valid FCM registration token') ||
        err?.message?.includes('SenderId mismatch')
      ) {
        await deactivateFcmToken(this.#env, token);
      }

      return false;
    }
  }

  /**
   * 모든 등록된 사용자에게 브로드캐스트 푸시 알림 전송
   */
  async broadcastToAll(payload: PushNotificationPayload): Promise<{
    success: number;
    failed: number;
  }> {
    const tokens = await getAllActiveFcmTokens(this.#env);

    let success = 0;
    let failed = 0;

    // 병렬로 전송 (최대 10개씩 배치)
    const batchSize = 10;
    for (let i = 0; i < tokens.length; i += batchSize) {
      const batch = tokens.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((t) => this.sendToToken(t.token, payload)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          success++;
        } else {
          failed++;
        }
      }
    }

    return { success, failed };
  }
}

/**
 * 공지사항 푸시 알림 전송
 */
export async function sendNoticePushNotification(
  env: Env,
  notice: {
    id: number;
    title: string;
    content: string;
    type?: string;
  },
): Promise<{ success: number; failed: number }> {
  const fcmService = new FcmService(env);

  // 내용을 100자로 제한
  const bodyPreview = notice.content.length > 100
    ? notice.content.substring(0, 97) + '...'
    : notice.content;

  return fcmService.broadcastToAll({
    title: notice.title,
    body: bodyPreview,
    data: {
      type: 'notice',
      noticeId: String(notice.id),
      noticeType: notice.type || 'general',
    },
    clickAction: '/notices',
  });
}
