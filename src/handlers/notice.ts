import { jsonWithCors } from "@gaiaprotocol/worker-common";
import { z } from "zod";
import { createNotice, fetchNotice, fetchNotices } from "../db/notice";
import { FCM_TOPICS, sendNoticePushNotification } from "../services/fcm";

/**
 * 관리자 비밀번호 검증
 */
function verifyAdminPassword(request: Request, env: Env): boolean {
  const password = request.headers.get('X-Admin-Password');
  if (!password || !env.ADMIN_PASSWORD) {
    return false;
  }
  return password === env.ADMIN_PASSWORD;
}

export async function handleNotices(env: Env): Promise<Response> {
  try {
    const notices = await fetchNotices(env);
    return jsonWithCors(notices);
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: 'Failed to fetch notices' }, 500);
  }
}

/**
 * POST /admin/verify
 * 관리자 비밀번호 검증
 */
export async function handleAdminVerify(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      password: z.string().min(1),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors({ success: false, error: 'Password is required' }, 400);
    }

    const { password } = parsed.data;

    if (!env.ADMIN_PASSWORD) {
      console.error('[handleAdminVerify] ADMIN_PASSWORD not configured');
      return jsonWithCors({ success: false, error: 'Admin not configured' }, 500);
    }

    if (password === env.ADMIN_PASSWORD) {
      return jsonWithCors({ success: true });
    }

    return jsonWithCors({ success: false, error: 'Invalid password' }, 401);
  } catch (err) {
    console.error('[handleAdminVerify] error', err);
    return jsonWithCors({ success: false, error: 'Internal server error' }, 500);
  }
}

/**
 * POST /notices/create
 * 새 공지사항 생성 및 푸시 알림 전송 (관리자 전용)
 */
export async function handleCreateNotice(request: Request, env: Env): Promise<Response> {
  try {
    // 관리자 비밀번호 확인
    if (!verifyAdminPassword(request, env)) {
      return jsonWithCors({ error: 'Unauthorized' }, 401);
    }

    // 요청 바디 파싱
    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      title: z.string().min(1).max(200),
      content: z.string().min(1).max(10000),
      type: z.string().optional(),
      translations: z.record(z.record(z.string())).optional(),
      sendPush: z.boolean().optional().default(true),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { title, content, type, translations, sendPush } = parsed.data;

    // 공지사항 생성
    const notice = await createNotice(env, {
      title,
      content,
      type,
      translations,
    });

    // 푸시 알림 전송 (토픽 기반)
    let pushSent = false;
    if (sendPush) {
      try {
        // 두 토픽에 모두 전송 (valhalla, personas)
        const results = await Promise.all([
          sendNoticePushNotification(env, {
            id: notice.id,
            title: notice.title,
            content: notice.content,
            type: notice.type,
          }, FCM_TOPICS.VALHALLA_NOTICES),
          sendNoticePushNotification(env, {
            id: notice.id,
            title: notice.title,
            content: notice.content,
            type: notice.type,
          }, FCM_TOPICS.PERSONAS_NOTICES),
        ]);
        pushSent = results.some(r => r.success);
      } catch (err) {
        console.error('[handleCreateNotice] Push notification failed:', err);
      }
    }

    return jsonWithCors({
      success: true,
      notice,
      pushSent,
    }, 201);
  } catch (err) {
    console.error('[handleCreateNotice] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

/**
 * POST /notices/send-push
 * 기존 공지사항에 대해 푸시 알림 재전송 (관리자 전용)
 */
export async function handleSendNoticePush(request: Request, env: Env): Promise<Response> {
  try {
    // 관리자 비밀번호 확인
    if (!verifyAdminPassword(request, env)) {
      return jsonWithCors({ error: 'Unauthorized' }, 401);
    }

    // 요청 바디 파싱
    const body = await request.json().catch(() => ({}));
    const schema = z.object({
      noticeId: z.number().int().positive(),
    });

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return jsonWithCors(
        { error: parsed.error.errors.map((e) => e.message).join(', ') },
        400,
      );
    }

    const { noticeId } = parsed.data;

    // 공지사항 조회
    const notice = await fetchNotice(env, noticeId);
    if (!notice) {
      return jsonWithCors({ error: 'Notice not found.' }, 404);
    }

    // 푸시 알림 전송 (두 토픽에 모두)
    const results = await Promise.all([
      sendNoticePushNotification(env, {
        id: notice.id,
        title: notice.title,
        content: notice.content,
        type: notice.type,
      }, FCM_TOPICS.VALHALLA_NOTICES),
      sendNoticePushNotification(env, {
        id: notice.id,
        title: notice.title,
        content: notice.content,
        type: notice.type,
      }, FCM_TOPICS.PERSONAS_NOTICES),
    ]);

    const success = results.some(r => r.success);

    return jsonWithCors({
      success,
    }, 200);
  } catch (err) {
    console.error('[handleSendNoticePush] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
