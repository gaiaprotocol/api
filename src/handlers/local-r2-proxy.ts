/**
 * /r2/avatars/<key>
 * /r2/banners/<key>
 * 형태의 요청을 각각 AVATAR_BUCKET, BANNER_BUCKET 에서 읽어서 반환하는 핸들러
 *
 * - 매칭 안 되면 null 반환 → 상위 라우터에서 다른 처리 (ASSETS 등) 하도록
 */
export async function handleLocalR2Proxy(
  req: Request,
  env: Env, // 프로젝트 Env 타입에 AVATAR_BUCKET, BANNER_BUCKET, ASSETS 등이 있다고 가정
): Promise<Response | null> {
  const url = new URL(req.url);

  if (!url.pathname.startsWith('/r2/')) {
    // 이 핸들러가 처리할 경로가 아니면 null
    return null;
  }

  try {
    // /r2/avatars/<key> 또는 /r2/banners/<key>
    const rest = url.pathname.slice('/r2/'.length); // "avatars/xxx" 또는 "banners/yyy"
    const [bucketName, ...keyParts] = rest.split('/');

    if (!bucketName || keyParts.length === 0) {
      return new Response('Not Found', { status: 404 });
    }

    const key = keyParts.join('/'); // "user-123.png" 등

    let bucket;
    if (bucketName === 'avatars') {
      bucket = env.AVATAR_BUCKET;
    } else if (bucketName === 'banners') {
      bucket = env.BANNER_BUCKET;
    } else {
      // 정의되지 않은 버킷 prefix
      return new Response('Not Found', { status: 404 });
    }

    console.log('Local R2 proxy:', { bucket: bucketName, key });

    const file = await bucket.get(key);
    if (!file) {
      return new Response('Not Found', { status: 404 });
    }

    const headers = new Headers();

    // 캐시 전략: 한 번 업로드되면 URL이 바뀐다고 가정하고 강한 캐시
    headers.append(
      'cache-control',
      'immutable, no-transform, max-age=31536000',
    );

    if (file.httpEtag) {
      headers.append('etag', file.httpEtag);
    }
    if (file.uploaded) {
      headers.append('date', file.uploaded.toUTCString());
    }

    // Content-Type 은 R2 메타데이터에 따라 자동으로 넣고 싶으면 httpMetadata 설정을 활용
    if (file.httpMetadata?.contentType) {
      headers.append('content-type', file.httpMetadata.contentType);
    }

    return new Response(file.body, { headers });
  } catch (ex) {
    console.error('Local R2 proxy error:', ex);
    return new Response('Internal server error', { status: 500 });
  }
}
