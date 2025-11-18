import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { getAddress } from 'viem';

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

interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  JWT_SECRET: string;
  COOKIE_SECRET: string;
}

async function authnFromHeader(request: Request, env: Env) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sessionId = m[1];
  const key = `sess:${sessionId}`;
  const rec = await env.SESSIONS.get(key);
  if (!rec) return null;
  return { sessionId, key, recordJson: rec, record: JSON.parse(rec) as SessionRecord };
}

export async function oauth2LinkWallet(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // 1) 세션 인증
    const authn = await authnFromHeader(request, env);
    if (!authn) return jsonWithCors({ error: 'Unauthorized' }, 401);

    const session = authn.record;
    const providerKey = session.provider;
    const user = session.user;
    if (!user?.sub) return jsonWithCors({ error: 'not_logged_in' }, 401);

    // 2) 월렛 토큰 추출
    let walletToken: string | undefined;
    const walletAuth = request.headers.get('x-wallet-auth');
    if (walletAuth?.startsWith('Bearer ')) {
      walletToken = walletAuth.slice(7);
    }
    if (!walletToken) {
      return jsonWithCors({ error: 'missing_wallet_token' }, 400);
    }

    // 3) 월렛 토큰 검증
    const payload = await verifyToken(walletToken, env);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'invalid_wallet_token' }, 401);
    }

    // 4) 주소 정규화
    let normalizedAddress: string;
    try {
      normalizedAddress = getAddress(payload.sub);
    } catch {
      return jsonWithCors({ error: 'invalid_wallet_address' }, 400);
    }

    // 5) 기존 동일 주소 매핑 제거
    await env.DB.prepare(
      `DELETE FROM oauth2_web3_accounts
       WHERE LOWER(wallet_address) = LOWER(?)`
    )
      .bind(normalizedAddress)
      .run();

    // 6) Upsert
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`
      INSERT INTO oauth2_web3_accounts
        (provider, sub, wallet_address, token, linked_at, email, name, picture)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, sub) DO UPDATE SET
        wallet_address = excluded.wallet_address,
        token          = excluded.token,
        linked_at      = excluded.linked_at,
        email          = excluded.email,
        name           = excluded.name,
        picture        = excluded.picture
    `)
      .bind(
        providerKey,
        user.sub,
        normalizedAddress,
        walletToken,
        now,
        user.email ?? null,
        user.name ?? null,
        user.picture ?? null
      )
      .run();

    // 7) TTL 롤링 (me와 동일)
    const ttlSeconds = 7 * 24 * 60 * 60;
    await env.SESSIONS.put(authn.key, authn.recordJson, { expirationTtl: ttlSeconds });

    return jsonWithCors({
      ok: true,
      wallet_address: normalizedAddress,
      token: walletToken,
      linked_at: now,
      profile: {
        provider: providerKey,
        sub: user.sub,
        email: user.email ?? null,
        name: user.name ?? null,
        picture: user.picture ?? null,
      },
    });
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
