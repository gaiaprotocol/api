import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { OAuth2ProviderConfig, ProviderRegistry } from 'cf-oauth';

type IDTokenPayload = {
  iss: string;
  aud: string | string[];
  sub: string;
  iat: number; // seconds
  exp: number; // seconds
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

type SessionRecord = {
  provider: string;
  created_at: number;
  user: {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
    email_verified?: boolean;
  };
  token: { id_token_hint: true; expires_in?: number };
};

type JoseJwk = JsonWebKey & {
  kid?: string;
  x5c?: string[];
  x5t?: string;
  'x5t#S256'?: string;
};
type JwksResponse = { keys: JoseJwk[] };

const b64urlToUint8 = (b64url: string): Uint8Array => {
  // base64url → base64
  const padLen = (4 - (b64url.length % 4)) % 4;
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const enc = new TextEncoder();
const randomB64url = (n = 48) => {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

function parseJwt(idToken: string) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('invalid_jwt');
  const [h, p, s] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToUint8(h))) as { alg: string; kid?: string; kty?: string };
  const payload = JSON.parse(new TextDecoder().decode(b64urlToUint8(p))) as IDTokenPayload;
  const signature = b64urlToUint8(s);
  const signingInput = enc.encode(`${h}.${p}`);
  return { header, payload, signature, signingInput };
}

async function fetchDiscovery(discovery: string) {
  const r = await fetch(discovery, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('discovery_failed');
  return r.json() as any;
}

// JwksResponse로 맞춤 + Cloudflare 캐시 힌트
async function fetchJWKS(jwksUri: string): Promise<JwksResponse> {
  const r = await fetch(jwksUri, { headers: { accept: 'application/json' }, cf: { cacheTtl: 300 } as any });
  if (!r.ok) throw new Error('jwks_failed');
  return r.json() as Promise<JwksResponse>;
}

async function getJWKS(cfg: OAuth2ProviderConfig): Promise<JwksResponse> {
  const o = cfg.oidc;
  if (!o) throw new Error('no_oidc_config');
  if (o.jwks_uri) return fetchJWKS(o.jwks_uri);
  if (!o.discovery) throw new Error('no_discovery_or_jwks');
  const disc = await fetchDiscovery(o.discovery);
  return fetchJWKS(disc.jwks_uri as string);
}

// kid 우선, 없으면 alg + kty/crv까지 보수적으로 매칭
function pickJwkForHeader(jwks: JwksResponse, header: { alg: string; kid?: string }): JoseJwk {
  if (header.kid) {
    const found = jwks.keys.find(k => k.kid === header.kid);
    if (found) return found;
  }
  const alg = header.alg;
  if (!alg) throw new Error('missing_alg');
  // RS256 → kty: "RSA", ES256 → kty: "EC", crv: "P-256"
  const isRS = alg === 'RS256';
  const isES = alg === 'ES256';
  const found = jwks.keys.find(k => {
    if (isRS) return (k.kty === 'RSA') && (!k.alg || k.alg === 'RS256');
    if (isES) return (k.kty === 'EC') && (k.crv === 'P-256') && (!k.alg || k.alg === 'ES256');
    return false;
  });
  if (!found) throw new Error('jwk_not_found');
  return found;
}

async function importVerifyKey(jwk: JoseJwk, alg: string): Promise<CryptoKey> {
  if (alg === 'RS256') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  if (alg === 'ES256') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  throw new Error(`unsupported_alg:${alg}`);
}

async function verifySignature(
  header: { alg: string; kid?: string },
  signature: Uint8Array,
  signingInput: Uint8Array,
  jwks: JwksResponse
) {
  const jwk = pickJwkForHeader(jwks, header);
  const key = await importVerifyKey(jwk, header.alg);
  if (header.alg === 'RS256') {
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signingInput);
  }
  if (header.alg === 'ES256') {
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, signingInput);
  }
  throw new Error(`unsupported_alg:${header.alg}`);
}

function assertClaims(payload: IDTokenPayload, cfg: OAuth2ProviderConfig, nonce?: string) {
  const o = cfg.oidc!;
  const now = Math.floor(Date.now() / 1000);

  // iss
  if (payload.iss !== o.issuer) throw new Error('invalid_iss');

  // aud
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const okAud =
    auds.includes(cfg.client_id) ||
    (o.acceptable_audiences ?? []).some(a => auds.includes(a));
  if (!okAud) throw new Error('invalid_aud');

  // exp/iat (±5m)
  if (payload.exp < now - 300) throw new Error('expired');
  if (payload.iat > now + 300) throw new Error('iat_in_future');

  // nonce
  if (nonce && payload.nonce !== nonce) throw new Error('nonce_mismatch');

  if (o.require_email_verified && payload.email && payload.email_verified === false) {
    throw new Error('email_not_verified');
  }
}

export async function oauth2LoginWithIdToken(
  request: Request,
  env: Env,
  providers: ProviderRegistry,
  providerKey: string
): Promise<Response> {
  if (request.method !== 'POST') return jsonWithCors({ error: 'method_not_allowed' }, 405);

  const cfg = providers[providerKey];
  if (!cfg?.oidc) return jsonWithCors({ error: 'unknown_or_non_oidc_provider', provider: providerKey }, 400);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: 'invalid_json' }, 400);
  }
  const idToken = body?.idToken as string | undefined;
  const nonce = body?.nonce as string | undefined;
  if (!idToken) return jsonWithCors({ error: 'missing_idToken' }, 400);
  if (!nonce) return jsonWithCors({ error: 'missing_nonce' }, 400);

  try {
    // 1) JWT 파싱
    const { header, payload, signature, signingInput } = parseJwt(idToken);

    // 2) JWKS 서명 검증
    const jwks = await getJWKS(cfg);
    const ok = await verifySignature(header, signature, signingInput, jwks);
    if (!ok) throw new Error('bad_signature');

    // 3) iss/aud/exp/iat/nonce 검증
    assertClaims(payload, cfg, nonce);

    // 4) 세션 발급 (기본 7일, env로 조절)
    const ttlSeconds = 7 * 24 * 60 * 60; // 7d
    const expiresIn = Math.max(0, payload.exp - Math.floor(Date.now() / 1000));

    const sessionId = randomB64url(48);
    const session: SessionRecord = {
      provider: providerKey,
      created_at: Date.now(),
      user: {
        sub: payload.sub,
        email: payload.email,
        name: payload.name,
        picture: payload.picture,
        email_verified: payload.email_verified,
      },
      token: { id_token_hint: true, expires_in: expiresIn },
    };

    await env.SESSIONS.put(`sess:${sessionId}`, JSON.stringify(session), {
      expirationTtl: ttlSeconds,
    });

    return jsonWithCors({ ok: true, sessionId, user: session.user, provider: providerKey });
  } catch (e: any) {
    // 과도한 내부 정보를 노출하지 않되, 디버깅용 detail은 남김
    return jsonWithCors({ error: 'invalid_idToken', detail: e?.message ?? String(e) }, 401);
  }
}
