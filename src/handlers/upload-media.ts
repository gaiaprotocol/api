import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { v4 as uuidv4 } from 'uuid';

// 업로드 가능한 최대 크기 (10MB 예시)
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type UploadTarget = 'avatar' | 'banner';

/**
 * 공통 이미지 업로드 핸들러
 *  - Authorization: Bearer <token> 으로 인증
 *  - body: 이미지 바이너리 (image/png, image/jpeg 등)
 *  - 성공 시: { url: string } JSON 반환
 *
 * Env 요구사항 예시:
 *  - AVATAR_BUCKET: R2Bucket
 *  - BANNER_BUCKET: R2Bucket
 *  - AVATAR_BASE_URL: string (예: https://static.example.com/avatars)
 *  - BANNER_BASE_URL: string (예: https://static.example.com/banners)
 */
async function handleImageUpload(
  request: Request,
  env: Env,
  target: UploadTarget,
): Promise<Response> {
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
      return jsonWithCors(
        { error: 'Invalid or expired token. Please log in again.' },
        401,
      );
    }

    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    // 2) Content-Type / 크기 검증
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      return jsonWithCors({ error: 'Only image uploads are allowed.' }, 400);
    }

    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader) {
      const len = Number(contentLengthHeader);
      if (!Number.isNaN(len) && len > MAX_IMAGE_BYTES) {
        return jsonWithCors(
          { error: `Image is too large. Max size is ${MAX_IMAGE_BYTES} bytes.` },
          413,
        );
      }
    }

    const body = await request.arrayBuffer();
    if (body.byteLength === 0) {
      return jsonWithCors({ error: 'Empty file.' }, 400);
    }
    if (body.byteLength > MAX_IMAGE_BYTES) {
      return jsonWithCors(
        { error: `Image is too large. Max size is ${MAX_IMAGE_BYTES} bytes.` },
        413,
      );
    }

    // 3) 업로드 대상 선택 (아바타 / 배너)
    let bucket: R2Bucket;
    let baseUrl: string;

    if (target === 'avatar') {
      bucket = env.AVATAR_BUCKET;
      baseUrl = env.AVATAR_BASE_URL; // 예: https://static.example.com/avatars
    } else {
      bucket = env.BANNER_BUCKET;
      baseUrl = env.BANNER_BASE_URL; // 예: https://static.example.com/banners
    }

    // 4) 키 생성
    const account = payload.sub as string;
    // 간단한 확장자 추출 (image/png -> png)
    const ext = contentType.split('/')[1] || 'bin';
    const key = `${account}/${uuidv4()}.${ext}`;

    // 5) R2 에 업로드
    await bucket.put(key, body, {
      httpMetadata: {
        contentType,
      },
    });

    const publicUrl = `${baseUrl}/${key}`;

    return jsonWithCors({ url: publicUrl }, 200);
  } catch (err) {
    console.error('[handleImageUpload] error', err);
    return jsonWithCors({ error: 'Failed to upload image.' }, 500);
  }
}

/** 아바타 업로드 핸들러: POST /upload/avatar */
export async function handleUploadAvatar(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonWithCors({ error: 'Method Not Allowed' }, 405);
  }
  return handleImageUpload(request, env, 'avatar');
}

/** 배너 업로드 핸들러: POST /upload/banner */
export async function handleUploadBanner(
  request: Request,
  env: Env,
): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonWithCors({ error: 'Method Not Allowed' }, 405);
  }
  return handleImageUpload(request, env, 'banner');
}
