-- =====================================================
-- fcm_tokens
-- FCM (Firebase Cloud Messaging) 토큰 저장 테이블.
-- 사용자별 기기 푸시 알림을 위한 토큰 관리.
-- =====================================================
CREATE TABLE IF NOT EXISTS fcm_tokens (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,

  -- 앱 구분: valhalla | personas
  app                   TEXT NOT NULL DEFAULT 'valhalla',

  -- 토큰 소유자 (지갑 주소)
  account               TEXT NOT NULL,

  -- FCM 등록 토큰
  token                 TEXT NOT NULL UNIQUE,

  -- 플랫폼 (web, android, ios)
  platform              TEXT NOT NULL DEFAULT 'web',

  -- 토큰 활성 상태 (1 = active, 0 = inactive)
  is_active             INTEGER NOT NULL DEFAULT 1,

  -- 마지막 사용 시간 (UNIX epoch seconds)
  last_used_at          INTEGER,

  -- 생성 시간 (UNIX epoch seconds)
  created_at            INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  -- 업데이트 시간 (UNIX epoch seconds)
  updated_at            INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

-- =====================================================
-- Index: 계정 + 앱별 활성 토큰 조회
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_account_app_active
  ON fcm_tokens (account, app, is_active);

-- =====================================================
-- Index: 앱별 활성 토큰 조회
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_app_active
  ON fcm_tokens (app, is_active);

-- =====================================================
-- Index: 토큰으로 빠른 조회
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token
  ON fcm_tokens (token);
