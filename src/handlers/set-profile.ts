import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { z } from 'zod';

const PROFILE_TABLE = 'profiles';
const MAX_NICKNAME_LEN = 50;
const MAX_BIO_LEN = 1000;
const MAX_URL_LEN = 2048;

function isValidNickname(nickname: string): boolean {
  // 유니코드 문자/숫자/공백/._- 만 허용, 선/후행 공백 금지, 연속 공백 허용 안 함(optional)
  if (!nickname) return false;
  if (nickname !== nickname.normalize('NFC')) return false;
  if (nickname.length > MAX_NICKNAME_LEN) return false;
  if (/^\s|\s$/.test(nickname)) return false;
  // 두 칸 이상 연속 공백 방지 (원치 않으면 이 줄 제거)
  if (/\s{2,}/.test(nickname)) return false;
  // 문자, 숫자, 공백, 점, 언더바, 하이픈 허용
  const re = /^[\p{L}\p{N}\s._-]+$/u;
  return re.test(nickname);
}

export async function handleSetProfile(request: Request, env: Env) {
  try {
    // 1) 인증
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }
    const token = auth.slice(7);

    let payload: any;
    try {
      payload = await verifyToken(token, env);
    } catch {
      return jsonWithCors({ error: 'Invalid or expired token. Please log in again.' }, 401);
    }
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    // 2) 입력 파싱 & 검증
    const body = await request.json().catch(() => ({}));

    const schema = z.object({
      nickname: z.string().trim().min(1, 'nickname is empty').max(MAX_NICKNAME_LEN).optional(),
      bio: z.string().trim().max(MAX_BIO_LEN).optional(),
      profile_image: z.string().trim().url().max(MAX_URL_LEN).optional(),
    }).refine(
      (v) => v.nickname !== undefined || v.bio !== undefined || v.profile_image !== undefined,
      { message: 'At least one of nickname, bio, or profile_image must be provided.' }
    );

    const parsed = schema.parse(body);

    // 추가 규칙 검사
    if (parsed.nickname !== undefined && !isValidNickname(parsed.nickname)) {
      return jsonWithCors({ error: 'The provided nickname contains invalid characters or format.' }, 400);
    }
    if (parsed.bio !== undefined && parsed.bio !== parsed.bio.normalize('NFC')) {
      return jsonWithCors({ error: 'The provided bio has invalid normalization (NFC required).' }, 400);
    }
    if (parsed.profile_image !== undefined) {
      // http/https만 허용하고, data: 등은 거부 (원하면 완화 가능)
      if (!/^https?:\/\//i.test(parsed.profile_image)) {
        return jsonWithCors({ error: 'Only http(s) URLs are allowed for profile_image.' }, 400);
      }
    }

    const account = payload.sub;
    const nickname = parsed.nickname ?? null;
    const bio = parsed.bio ?? null;
    const profileImage = parsed.profile_image ?? null;

    // 3) UPSERT (부분 업데이트: 전달된 필드만 갱신, 나머지는 보존)
    // - 새 레코드: created_at은 테이블 디폴트 사용
    // - 기존 레코드: COALESCE로 전달된 값이 없으면 기존 값을 유지
    await env.DB.prepare(
      `
      INSERT INTO ${PROFILE_TABLE} (account, nickname, bio, profile_image)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(account) DO UPDATE SET
        nickname      = COALESCE(excluded.nickname, ${PROFILE_TABLE}.nickname),
        bio           = COALESCE(excluded.bio, ${PROFILE_TABLE}.bio),
        profile_image = COALESCE(excluded.profile_image, ${PROFILE_TABLE}.profile_image),
        updated_at    = strftime('%s','now')
      `
    ).bind(account, nickname, bio, profileImage).run();

    return jsonWithCors({ ok: true });
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
