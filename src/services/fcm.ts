// Topic name for notices
export const FCM_TOPIC_NOTICES = 'notices';

// App types
export type AppType = 'valhalla' | 'personas';

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, string>;
  clickAction?: string;
}

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

interface FCMMessageBase {
  notification?: {
    title: string;
    body: string;
    image?: string;
  };
  data?: Record<string, string>;
  android?: {
    priority?: 'normal' | 'high';
    notification?: {
      channel_id?: string;
      click_action?: string;
    };
  };
  apns?: {
    headers?: Record<string, string>;
    payload?: {
      aps?: {
        alert?: {
          title?: string;
          body?: string;
        };
        sound?: string;
        badge?: number;
      };
    };
  };
  webpush?: {
    notification?: {
      icon?: string;
      badge?: string;
    };
    fcm_options?: {
      link?: string;
    };
  };
}

interface FCMTopicMessage extends FCMMessageBase {
  topic: string;
}

// JWT 생성용 유틸
function base64urlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function textToArrayBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

async function createJWT(
  serviceAccount: ServiceAccountKey,
  scope: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1시간 후 만료

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: serviceAccount.token_uri,
    iat: now,
    exp,
    scope,
  };

  const headerB64 = base64urlEncode(textToArrayBuffer(JSON.stringify(header)));
  const payloadB64 = base64urlEncode(textToArrayBuffer(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  // PEM 형식의 private key를 CryptoKey로 변환
  const privateKey = await importPrivateKey(serviceAccount.private_key);

  // 서명
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    textToArrayBuffer(unsignedToken),
  );

  return `${unsignedToken}.${base64urlEncode(signature)}`;
}

async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // PEM 형식에서 base64 부분만 추출
  const pemContents = pemKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');

  const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function getAccessToken(serviceAccount: ServiceAccountKey): Promise<string> {
  const jwt = await createJWT(
    serviceAccount,
    'https://www.googleapis.com/auth/firebase.messaging',
  );

  const response = await fetch(serviceAccount.token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

/**
 * FCM 푸시 알림 전송 서비스
 */
export class FcmService {
  #serviceAccount: ServiceAccountKey;
  #app: AppType;

  constructor(env: Env, app: AppType = 'valhalla') {
    this.#app = app;

    // 앱 별로 다른 Firebase 서비스 계정 사용
    const serviceAccountJson = app === 'personas'
      ? env.FIREBASE_SERVICE_ACCOUNT_JSON_PERSONAS
      : env.FIREBASE_SERVICE_ACCOUNT_JSON_VALHALLA;

    this.#serviceAccount = JSON.parse(serviceAccountJson);
  }

  /**
   * FCM 토큰을 특정 토픽에 구독
   */
  async subscribeToTopic(token: string, topic: string): Promise<boolean> {
    try {
      const accessToken = await getAccessToken(this.#serviceAccount);

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
        console.error(`[FCM] Failed to subscribe token to topic (${response.status}): ${error}`);
        return false;
      }

      console.log(`[FCM] Token subscribed to topic: ${topic} (app: ${this.#app})`);
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
      const accessToken = await getAccessToken(this.#serviceAccount);

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
        console.error(`[FCM] Failed to unsubscribe token from topic (${response.status}): ${error}`);
        return false;
      }

      console.log(`[FCM] Token unsubscribed from topic: ${topic} (app: ${this.#app})`);
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
    try {
      const accessToken = await getAccessToken(this.#serviceAccount);

      const message: FCMTopicMessage = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
          image: payload.icon,
        },
        data: payload.data,
        android: {
          priority: 'high',
          notification: {
            channel_id: 'notices',
            click_action: payload.clickAction || 'OPEN_APP',
          },
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: payload.title,
                body: payload.body,
              },
              sound: 'default',
              badge: 1,
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

      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${this.#serviceAccount.project_id}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message }),
        },
      );

      if (!response.ok) {
        const error = await response.json() as { error?: { message?: string } };
        console.error(`[FCM] Failed to send to topic: ${topic} (app: ${this.#app})`, error.error?.message);
        return false;
      }

      const result = (await response.json()) as { name: string };
      console.log(`[FCM] Push sent to topic: ${topic} (app: ${this.#app}), messageId: ${result.name}`);
      return true;
    } catch (err: any) {
      console.error(`[FCM] Error sending to topic: ${topic} (app: ${this.#app})`, err?.message || err);
      return false;
    }
  }
}

/**
 * 공지사항 푸시 알림 전송 (토픽 기반, 모든 앱에 전송)
 */
export async function sendNoticePushNotification(
  env: Env,
  notice: {
    id: number;
    title: string;
    content: string;
    type?: string;
  },
): Promise<{ success: boolean; results: { valhalla: boolean; personas: boolean } }> {
  // 내용을 100자로 제한
  const bodyPreview = notice.content.length > 100
    ? notice.content.substring(0, 97) + '...'
    : notice.content;

  const payload: PushNotificationPayload = {
    title: notice.title,
    body: bodyPreview,
    data: {
      type: 'notice',
      noticeId: String(notice.id),
      noticeType: notice.type || 'general',
    },
    clickAction: '/notices',
  };

  // 두 앱에 모두 전송
  const [valhallaResult, personasResult] = await Promise.all([
    new FcmService(env, 'valhalla').sendToTopic(FCM_TOPIC_NOTICES, payload).catch(() => false),
    new FcmService(env, 'personas').sendToTopic(FCM_TOPIC_NOTICES, payload).catch(() => false),
  ]);

  return {
    success: valhallaResult || personasResult,
    results: {
      valhalla: valhallaResult,
      personas: personasResult,
    },
  };
}
