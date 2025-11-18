import { jsonWithCors } from '@gaiaprotocol/worker-common';

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
  user?: {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    [k: string]: unknown;
  };
  absolute_deadline?: number;
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

export async function oauth2UnlinkWalletBySession(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // 1) 세션 인증
    const authn = await authnFromHeader(request, env);
    if (!authn) return jsonWithCors({ error: 'Unauthorized' }, 401);

    const session = authn.record;
    const providerKey = session.provider;
    const sub = session.user?.sub;
    if (!sub) return jsonWithCors({ error: 'not_logged_in' }, 401);

    // 2) provider+sub 기반 언링크
    const result = await env.DB.prepare(
      `DELETE FROM oauth2_web3_accounts
       WHERE provider = ? AND sub = ?`
    )
      .bind(providerKey, sub)
      .run();

    // 3) TTL 롤링 (me와 동일 정책)
    const ttlSeconds = 7 * 24 * 60 * 60;
    await env.SESSIONS.put(authn.key, authn.recordJson, { expirationTtl: ttlSeconds });

    return jsonWithCors({ ok: true, deleted: result.meta?.changes ?? 0 }, 200);
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
