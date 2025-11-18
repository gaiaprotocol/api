import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { ProviderRegistry } from 'cf-oauth';

type SessionRecord = {
  provider: string;
  created_at: number;
  token?: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    id_token?: string;
    [k: string]: unknown;
  };
  user?: unknown;
  absolute_deadline?: number; // 선택: 절대 만료 정책에 사용
};

const randomBytesBase64Url = (n = 48): string => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  const s = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  return s;
};

async function authnFromHeader(request: Request, env: Env) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sessionId = m[1];
  const key = `sess:${sessionId}`;
  const rec = await env.SESSIONS.get(key);
  if (!rec) return null;
  return { sessionId, key, recordJson: rec, record: JSON.parse(rec) as SessionRecord };
}

/**
 * GET /me
 * - 현재 로그인 사용자 정보 반환
 * - ?refresh=1 또는 x-refresh-userinfo: 1 → provider의 userinfo를 다시 조회 후 저장
 * - ?rotate=1 → 새 세션ID 발급(헤더 x-session-rotate)
 */
export async function oauth2Me(
  request: Request,
  env: Env,
  providers: ProviderRegistry
): Promise<Response> {
  const authn = await authnFromHeader(request, env);
  if (!authn) return jsonWithCors({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const wantRefresh = url.searchParams.get('refresh') === '1' ||
    request.headers.get('x-refresh-userinfo') === '1';
  const wantRotate = url.searchParams.get('rotate') === '1';

  const session = authn.record;
  const providerKey = session.provider;
  const cfg = providers[providerKey];

  // (선택) userinfo 갱신
  if (wantRefresh && cfg?.userinfo_url && session.token?.access_token) {
    try {
      const ui = await fetch(cfg.userinfo_url, {
        headers: { Authorization: `Bearer ${session.token.access_token}`, accept: 'application/json' }
      });
      if (ui.ok) {
        session.user = await ui.json();
      }
    } catch (_) {
      // userinfo 실패는 전체 요청 실패로 보지 않음
    }
  }

  const row = await env.DB.prepare(
    `SELECT wallet_address, token, linked_at, email, name, picture
      FROM oauth2_web3_accounts
      WHERE provider = ? AND sub = ?`
  )
    .bind(providerKey, (session.user as any)?.sub)
    .first<{
      wallet_address: string | null;
      token: string | null;
      linked_at: number | null;
      email: string | null;
      name: string | null;
      picture: string | null;
    }>();

  // 롤링 TTL 적용
  const ttlSeconds = 7 * 24 * 60 * 60 // 7 days
  let sessionKey = authn.key;
  let sessionId = authn.sessionId;

  // (선택) 세션 회전
  if (wantRotate) {
    const newId = randomBytesBase64Url(48);
    const newKey = `sess:${newId}`;
    await env.SESSIONS.put(newKey, JSON.stringify(session), { expirationTtl: ttlSeconds });
    await env.SESSIONS.delete(sessionKey);
    sessionKey = newKey;
    sessionId = newId;
    // 헤더로 회전 사실 알림
    const res = jsonWithCors(
      {
        ok: true,
        user: session.user ?? null,
        provider: providerKey,
        token_expires_in: session.token?.expires_in ?? null,

        wallet_address: row?.wallet_address ?? null,
        token: row?.token ?? null,
        linked_at: row?.linked_at ?? null,
        email: row?.email ?? null,
      },
      200
    );
    const h = new Headers(res.headers);
    h.set('x-session-rotate', sessionId);
    // 새 TTL로 롤링
    return new Response(res.body, { status: res.status, headers: h });
  } else {
    // 회전 없이 롤링 TTL만 갱신
    await env.SESSIONS.put(sessionKey, JSON.stringify(session), { expirationTtl: ttlSeconds });
  }

  return jsonWithCors({
    ok: true,
    user: session.user ?? null,
    provider: providerKey,
    token_expires_in: session.token?.expires_in ?? null,

    wallet_address: row?.wallet_address ?? null,
    token: row?.token ?? null,
    linked_at: row?.linked_at ?? null,
    email: row?.email ?? null,
  });
}
