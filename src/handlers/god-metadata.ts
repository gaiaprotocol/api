import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { getBulkNftData } from '../services/nft';
import { metadataTransformer } from '../utils/metadata-transformer';

export async function handleGodMetadata(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');

    const tokenIdStr = segments[3];

    if (!tokenIdStr) {
      return jsonWithCors({ error: 'Invalid request' }, 400);
    }

    const tokenId = parseInt(tokenIdStr);
    if (isNaN(tokenId) || tokenId < 0) {
      return jsonWithCors({ error: 'Invalid token ID' }, 400);
    }

    const data = await getBulkNftData(env, [{ collection: 'gaia-protocol-gods', tokenId }]);

    const key = `gaia-protocol-gods:${tokenId}`;
    const nft = data[key];

    if (!nft) {
      return jsonWithCors({ error: 'NFT data not found' }, 404);
    }

    const metadata = metadataTransformer.toOpenSeaFormat(nft);

    return jsonWithCors(metadata);
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
