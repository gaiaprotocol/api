import { EnhancedFcmMessage, FCM, FcmOptions } from 'fcm-cloudflare-workers';

// Topic name for notices
export const FCM_TOPIC_NOTICES = 'notices';

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
  #serviceAccount: any;

  constructor(env: Env) {
    this.#env = env;
    this.#serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
    const fcmOptions = new FcmOptions({
      serviceAccount: this.#serviceAccount,
      kvStore: env.FCM_TOKEN_CACHE,
      kvCacheKey: 'fcm_access_token',
    });
    this.#fcm = new FCM(fcmOptions);
  }

  /**
   * FCM 토큰을 특정 토픽에 구독
   */
  async subscribeToTopic(token: string, topic: string): Promise<boolean> {
    try {
      // Get access token for Firebase API
      const accessToken = await this.#getAccessToken();

      const response = await fetch(
        `https://iid.googleapis.com/iid/v1/${token}/rel/topics/${topic}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(`[FCM] Failed to subscribe token to topic: ${error}`);
        return false;
      }

      console.log(`[FCM] Token subscribed to topic: ${topic}`);
      return true;
    } catch (err) {
      console.error('[FCM] Error subscribing to topic:', err);
      return false;
    }
  }

  /**
   * FCM 토큰을 특정 토픽에서 구독 해제
   */
  async unsubscribeFromTopic(token: string, topic: string): Promise<boolean> {
    try {
      const accessToken = await this.#getAccessToken();

      const response = await fetch(
        `https://iid.googleapis.com/iid/v1/${token}/rel/topics/${topic}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(`[FCM] Failed to unsubscribe token from topic: ${error}`);
        return false;
      }

      console.log(`[FCM] Token unsubscribed from topic: ${topic}`);
      return true;
    } catch (err) {
      console.error('[FCM] Error unsubscribing from topic:', err);
      return false;
    }
  }

  /**
   * 토픽으로 푸시 알림 전송
   */
  async sendToTopic(topic: string, payload: PushNotificationPayload): Promise<boolean> {
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
      await this.#fcm.sendToTopic(message, topic);
      console.log(`[FCM] Push sent to topic: ${topic}`);
      return true;
    } catch (err: any) {
      console.error(`[FCM] Failed to send to topic: ${topic}`, err);
      return false;
    }
  }

  /**
   * Get OAuth2 access token for Firebase API calls
   */
  async #getAccessToken(): Promise<string> {
    // Check cache first
    const cached = await this.#env.FCM_TOKEN_CACHE.get('fcm_access_token');
    if (cached) {
      return cached;
    }

    // Generate new token using JWT
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const payload = {
      iss: this.#serviceAccount.client_email,
      sub: this.#serviceAccount.client_email,
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    };

    const jwt = await this.#signJwt(header, payload, this.#serviceAccount.private_key);

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });

    const data: any = await response.json();
    const accessToken = data.access_token;

    // Cache the token (expires in 1 hour, cache for 55 minutes)
    await this.#env.FCM_TOKEN_CACHE.put('fcm_access_token', accessToken, {
      expirationTtl: 55 * 60,
    });

    return accessToken;
  }

  async #signJwt(header: any, payload: any, privateKeyPem: string): Promise<string> {
    const encoder = new TextEncoder();

    const headerB64 = this.#base64UrlEncode(JSON.stringify(header));
    const payloadB64 = this.#base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    // Import the private key
    const privateKey = await crypto.subtle.importKey(
      'pkcs8',
      this.#pemToBinary(privateKeyPem),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Sign the input
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      privateKey,
      encoder.encode(signingInput)
    );

    const signatureB64 = this.#base64UrlEncode(
      String.fromCharCode(...new Uint8Array(signature))
    );

    return `${signingInput}.${signatureB64}`;
  }

  #base64UrlEncode(str: string): string {
    const base64 = btoa(str);
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  #pemToBinary(pem: string): ArrayBuffer {
    const lines = pem.split('\n');
    const base64 = lines
      .filter(line => !line.startsWith('-----'))
      .join('');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

/**
 * 공지사항 푸시 알림 전송 (토픽 기반)
 */
export async function sendNoticePushNotification(
  env: Env,
  notice: {
    id: number;
    title: string;
    content: string;
    type?: string;
  },
): Promise<{ success: boolean }> {
  const fcmService = new FcmService(env);

  // 내용을 100자로 제한
  const bodyPreview = notice.content.length > 100
    ? notice.content.substring(0, 97) + '...'
    : notice.content;

  const success = await fcmService.sendToTopic(FCM_TOPIC_NOTICES, {
    title: notice.title,
    body: bodyPreview,
    data: {
      type: 'notice',
      noticeId: String(notice.id),
      noticeType: notice.type || 'general',
    },
    clickAction: '/notices',
  });

  return { success };
}
