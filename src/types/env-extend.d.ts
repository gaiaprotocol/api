/**
 * Cloudflare Worker Env 타입 확장
 * Secrets로 설정되는 환경 변수들은 wrangler types로 자동 생성되지 않으므로
 * 여기서 별도로 선언합니다.
 */
declare namespace Cloudflare {
  interface Env {
    // FCM Legacy Server Keys (secrets)
    FIREBASE_SERVER_KEY_VALHALLA?: string;
    FIREBASE_SERVER_KEY_PERSONAS?: string;
  }
}
