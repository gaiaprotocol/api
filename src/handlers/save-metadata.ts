import type { GodMetadata } from '@gaiaprotocol/god-mode-shared';
import { client, GOD_NFT_ADDRESS, WHITELIST } from '@gaiaprotocol/god-mode-worker';
import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { generateGodImage } from '../services/god-image';
import { getAddress } from 'viem';

// GodMetadata에 맞춘 입력 스키마
const ElementEnum = z.enum(['Stone', 'Fire', 'Water']);
const GenderEnum = z.enum(['Man', 'Woman']);

const metadataSchema = z.object({
  id: z.coerce.number(),
  type: ElementEnum,
  gender: GenderEnum,
  // { [category: string]: string } 형태
  parts: z.record(z.string(), z.string()),
}) satisfies z.ZodType<GodMetadata>;

export async function handleSaveMetadata(request: Request, env: Env) {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors({ error: 'Missing or invalid authorization token.' }, 401);
    }

    const token = auth.slice(7);

    let payload;
    try {
      payload = await verifyToken(token, env);
    } catch {
      return jsonWithCors({ error: 'Invalid or expired token. Please log in again.' }, 401);
    }

    if (!payload?.sub) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    const walletAddress = getAddress(payload.sub);

    const body = await request.json();
    const metadata = metadataSchema.parse(body);

    const owner = await client.readContract({
      address: GOD_NFT_ADDRESS,
      abi: [
        {
          name: 'ownerOf',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'tokenId', type: 'uint256' }],
          outputs: [{ name: '', type: 'address' }],
        },
      ],
      functionName: 'ownerOf',
      args: [BigInt(metadata.id)],
    }) as `0x${string}`;

    if (owner !== walletAddress && !WHITELIST.includes(walletAddress)) {
      return jsonWithCors({ error: 'Unauthorized' }, 401);
    }

    const image = await generateGodImage(env, request.url, metadata);

    // DB에서 기존 이미지 키 조회
    const originalData = await env.DB
      .prepare(`SELECT image FROM nfts WHERE nft_address = ? AND token_id = ?`)
      .bind(GOD_NFT_ADDRESS, metadata.id)
      .first<{ image: string }>();

    // 기존 이미지 삭제 (실패해도 무시)
    if (originalData?.image) {
      try {
        await env.GOD_IMAGES_BUCKET.delete(`${metadata.id}/${originalData.image}`);
      } catch (e) {
        console.warn('Failed to delete previous image', e);
      }
    }

    // 새 이미지 업로드
    const fileName = `${uuidv4()}.png`;
    const imageKey = `${metadata.id}/${fileName}`;
    await env.GOD_IMAGES_BUCKET.put(imageKey, image, {
      httpMetadata: {
        contentType: 'image/png',
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        tokenId: String(metadata.id),
      },
    });

    const sql = `
      INSERT INTO nfts (nft_address, token_id, holder, type, gender, parts, image)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(nft_address, token_id) DO UPDATE SET
        holder = excluded.holder,
        type   = excluded.type,
        gender = excluded.gender,
        parts  = excluded.parts,
        image  = excluded.image
    `;

    // 메타 저장 (traits/parts)
    const row = await env.DB
      .prepare(sql)
      .bind(
        GOD_NFT_ADDRESS,
        metadata.id,
        walletAddress,
        metadata.type,
        metadata.gender,
        JSON.stringify(metadata.parts),
        imageKey
      )
      .run();

    if (!row) {
      // 업로드 롤백은 선택 사항 (여기선 유지)
      return jsonWithCors({ error: 'Failed to save metadata' }, 500);
    }

    return jsonWithCors({ status: 'ok' }, 200);
  } catch (err) {
    console.error(err);

    if (err instanceof z.ZodError) {
      return jsonWithCors(
        { error: 'Invalid payload', details: err.flatten() },
        400
      );
    }
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
