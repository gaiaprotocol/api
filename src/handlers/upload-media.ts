import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { v4 as uuidv4 } from 'uuid';
import {
  AVATAR_THUMBNAIL_CONFIG,
  BANNER_THUMBNAIL_CONFIG,
  ThumbnailConfig,
  resizeImage,
} from '../utils/image-resize';

// 업로드 가능한 최대 크기 (10MB 예시)
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

type UploadTarget = 'avatar' | 'banner';

/**
 * resvg를 사용하여 실제 썸네일 이미지를 생성하고 R2에 저장
 */
async function generateAndUploadThumbnail(
  imageBuffer: ArrayBuffer,
  bucket: R2Bucket,
  thumbnailKey: string,
  config: ThumbnailConfig,
): Promise<boolean> {
  try {
    // resvg를 사용하여 이미지 리사이즈
    const resizedBuffer = resizeImage(imageBuffer, config);

    // R2에 썸네일 저장
    await bucket.put(thumbnailKey, resizedBuffer, {
      httpMetadata: {
        contentType: 'image/png',
      },
    });

    return true;
  } catch (err) {
    console.error('[generateAndUploadThumbnail] error:', err);
    return false;
  }
}

/**
 * 공통 이미지 업로드 핸들러
 *  - Authorization: Bearer <token> 으로 인증
 *  - body: 이미지 바이너리 (image/png, image/jpeg 등)
 *  - 성공 시: { url: string, thumbnailUrl: string } JSON 반환
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
    let thumbnailConfig: ThumbnailConfig;

    if (target === 'avatar') {
      bucket = env.AVATAR_BUCKET;
      baseUrl = env.AVATAR_BASE_URL;
      thumbnailConfig = AVATAR_THUMBNAIL_CONFIG;
    } else {
      bucket = env.BANNER_BUCKET;
      baseUrl = env.BANNER_BASE_URL;
      thumbnailConfig = BANNER_THUMBNAIL_CONFIG;
    }

    // 4) 키 생성
    const account = payload.sub as string;
    const uuid = uuidv4();
    // 간단한 확장자 추출 (image/png -> png)
    const ext = contentType.split('/')[1] || 'bin';
    const key = `${account}/${uuid}.${ext}`;
    const thumbnailKey = `${account}/${uuid}_thumb.png`;

    // 5) R2 에 원본 이미지 업로드
    await bucket.put(key, body, {
      httpMetadata: {
        contentType,
      },
    });

    const publicUrl = `${baseUrl}/${key}`;
    let thumbnailUrl = publicUrl; // 기본값: 원본 URL (썸네일 생성 실패 시)

    // 6) 썸네일 생성 및 업로드
    const thumbnailSuccess = await generateAndUploadThumbnail(
      body,
      bucket,
      thumbnailKey,
      thumbnailConfig,
    );

    if (thumbnailSuccess) {
      thumbnailUrl = `${baseUrl}/${thumbnailKey}`;
    } else {
      console.warn(
        '[handleImageUpload] Thumbnail generation failed, using original URL as fallback',
      );
    }

    return jsonWithCors({ url: publicUrl, thumbnailUrl }, 200);
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
