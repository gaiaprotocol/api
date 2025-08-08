import { jsonWithCors } from "@gaiaprotocol/worker-common";
import { fetchHeldNftData } from "../services/nft";
import { getAddress } from "viem";

export async function handleHeldNftsRequest(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const segments = url.pathname.split('/');

    const walletAddress = segments[1];

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return jsonWithCors({ error: 'Invalid wallet address' }, 400);
    }

    const metadataMap = await fetchHeldNftData(env, getAddress(walletAddress));

    const metadataList = Object.values(metadataMap);

    return jsonWithCors(metadataList);
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
}
