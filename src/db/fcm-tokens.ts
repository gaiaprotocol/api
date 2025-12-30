export const FCM_TOKENS_TABLE = 'fcm_tokens';

export type AppType = 'valhalla' | 'personas';

export interface FcmTokenRow {
  id: number;
  app: AppType;
  account: string;
  token: string;
  platform: string;
  is_active: number;
  last_used_at: number | null;
  created_at: number;
  updated_at: number;
}

/**
 * FCM 토큰 등록 또는 업데이트
 * 토큰이 이미 존재하면 account와 업데이트 시간을 갱신
 */
export async function upsertFcmToken(
  env: Env,
  params: {
    app?: AppType;
    account: string;
    token: string;
    platform?: string;
  },
): Promise<FcmTokenRow> {
  const { app = 'valhalla', account, token, platform = 'web' } = params;
  const now = Math.floor(Date.now() / 1000);

  const result = await env.DB.prepare(
    `
    INSERT INTO ${FCM_TOKENS_TABLE} (app, account, token, platform, is_active, last_used_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(token) DO UPDATE SET
      app = excluded.app,
      account = excluded.account,
      platform = excluded.platform,
      is_active = 1,
      last_used_at = excluded.last_used_at,
      updated_at = excluded.updated_at
    RETURNING *
    `,
  )
    .bind(app, account, token, platform, now, now, now)
    .first<FcmTokenRow>();

  if (!result) {
    throw new Error('Failed to upsert FCM token');
  }

  return result;
}

/**
 * 계정의 모든 활성 FCM 토큰 조회
 */
export async function getActiveFcmTokensByAccount(
  env: Env,
  account: string,
): Promise<FcmTokenRow[]> {
  const result = await env.DB.prepare(
    `
    SELECT * FROM ${FCM_TOKENS_TABLE}
    WHERE account = ? AND is_active = 1
    ORDER BY updated_at DESC
    `,
  )
    .bind(account)
    .all<FcmTokenRow>();

  return result.results ?? [];
}

/**
 * 모든 활성 FCM 토큰 조회 (브로드캐스트용)
 */
export async function getAllActiveFcmTokens(
  env: Env,
): Promise<FcmTokenRow[]> {
  const result = await env.DB.prepare(
    `
    SELECT * FROM ${FCM_TOKENS_TABLE}
    WHERE is_active = 1
    ORDER BY updated_at DESC
    `,
  ).all<FcmTokenRow>();

  return result.results ?? [];
}

/**
 * FCM 토큰 비활성화 (토큰이 만료되거나 에러 발생 시)
 */
export async function deactivateFcmToken(
  env: Env,
  token: string,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);

  const result = await env.DB.prepare(
    `
    UPDATE ${FCM_TOKENS_TABLE}
    SET is_active = 0, updated_at = ?
    WHERE token = ?
    `,
  )
    .bind(now, token)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * 계정의 특정 토큰 삭제
 */
export async function deleteFcmToken(
  env: Env,
  params: { account: string; token: string; app?: AppType },
): Promise<boolean> {
  const { account, token, app } = params;

  const sql = app
    ? `DELETE FROM ${FCM_TOKENS_TABLE} WHERE account = ? AND token = ? AND app = ?`
    : `DELETE FROM ${FCM_TOKENS_TABLE} WHERE account = ? AND token = ?`;

  const stmt = env.DB.prepare(sql);
  const result = app
    ? await stmt.bind(account, token, app).run()
    : await stmt.bind(account, token).run();

  return (result.meta?.changes ?? 0) > 0;
}

/**
 * 계정의 모든 토큰 삭제
 */
export async function deleteAllFcmTokensByAccount(
  env: Env,
  account: string,
): Promise<number> {
  const result = await env.DB.prepare(
    `
    DELETE FROM ${FCM_TOKENS_TABLE}
    WHERE account = ?
    `,
  )
    .bind(account)
    .run();

  return result.meta?.changes ?? 0;
}
