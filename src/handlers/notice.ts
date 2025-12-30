import { jsonWithCors, verifyToken } from "@gaiaprotocol/worker-common";
import { z } from "zod";
import { createNotice, fetchNotices } from "../db/notice";
import { sendNoticePushNotification } from "../services/fcm";

// 관리자 주소 목록 (환경변수로 관리하는 것이 좋음)
const ADMIN_ADDRESSES = [
  '0x67e81DE7802A5f7efEF66b156F2d06a526Bd5BD6', // HOLDING_VERIFIER
].map((a) => a.toLowerCase());

function isAdmin(address: string): boolean {
  return ADMIN_ADDRESSES.includes(address.toLowerCase());
}

export async function handleNotices(env: Env): Promise<Response> {
  try {
    const notices = await fetchNotices(env);

    return jsonWithCors({
      success: true,
      data: notices
    });
  } catch (err) {
    console.error(err);
    return jsonWithCors({
      success: false,
      error: 'Failed to fetch notices'
    }, 500);
  }
}

/**
 * POST /notices/create
 * 새 공지사항 생성 및 푸시 알림 전송 (관리자 전용)
 *
 * Body:
 *  {
 *    title: string;
 *    content: string;
 *    type?: string;  // 'update', 'news', 'event' 등
 *    translations?: Record<string, Record<string, string>>;
 *    sendPush?: boolean;  // 푸시 알림 전송 여부 (기본: true)
 *  }
 *
 * Response:
 *  {
 *    success: true,
 *    notice: Notice,
 *    push?: { success: number, failed: number }
 *  }
 */
export async function handleCreateNotice(request: Request, env: Env): Promise<Response> {
  try {
    // 인증 확인
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    const payload: any = await verifyToken(token, env).catch(() => null);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid or expired token.' }, 401);
    }

    const userAddress = payload.sub as string;

    // 관리자 권한 확인
    if (!isAdmin(userAddress)) {
      return jsonWithCors({ error: 'Admin access required.' }, 403);
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

    // 푸시 알림 전송
    let pushResult: { success: number; failed: number } | undefined;
    if (sendPush) {
      try {
        pushResult = await sendNoticePushNotification(env, {
          id: notice.id,
          title: notice.title,
          content: notice.content,
          type: notice.type,
        });
      } catch (err) {
        console.error('[handleCreateNotice] Push notification failed:', err);
        // 푸시 실패해도 공지사항은 생성됨
      }
    }

    return jsonWithCors({
      success: true,
      notice,
      push: pushResult,
    }, 201);
  } catch (err) {
    console.error('[handleCreateNotice] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}

/**
 * POST /notices/send-push
 * 기존 공지사항에 대해 푸시 알림 재전송 (관리자 전용)
 *
 * Body:
 *  { noticeId: number }
 *
 * Response:
 *  { success: true, push: { success: number, failed: number } }
 */
export async function handleSendNoticePush(request: Request, env: Env): Promise<Response> {
  try {
    // 인증 확인
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);
    const payload: any = await verifyToken(token, env).catch(() => null);
    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid or expired token.' }, 401);
    }

    const userAddress = payload.sub as string;

    // 관리자 권한 확인
    if (!isAdmin(userAddress)) {
      return jsonWithCors({ error: 'Admin access required.' }, 403);
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
    const { fetchNotice } = await import('../db/notice');
    const notice = await fetchNotice(env, noticeId);

    if (!notice) {
      return jsonWithCors({ error: 'Notice not found.' }, 404);
    }

    // 푸시 알림 전송
    const pushResult = await sendNoticePushNotification(env, {
      id: notice.id,
      title: notice.title,
      content: notice.content,
      type: notice.type,
    });

    return jsonWithCors({
      success: true,
      push: pushResult,
    }, 200);
  } catch (err) {
    console.error('[handleSendNoticePush] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
