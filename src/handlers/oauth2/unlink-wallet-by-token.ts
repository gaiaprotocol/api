import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';
import { getAddress } from 'viem';

export async function oauth2UnlinkWalletByToken(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    // 1) 월렛 토큰 추출
    let walletToken: string | undefined;
    const walletAuth = request.headers.get('x-wallet-auth');
    if (walletAuth?.startsWith('Bearer ')) walletToken = walletAuth.slice(7);
    if (!walletToken) {
      const auth = request.headers.get('authorization');
      if (auth?.startsWith('Bearer ')) walletToken = auth.slice(7);
    }
    if (!walletToken) return jsonWithCors({ error: 'missing_wallet_token' }, 400);

    // 2) 토큰 검증 → 주소 획득
    const payload = await verifyToken(walletToken, env);
    if (!payload?.sub) return jsonWithCors({ error: 'invalid_wallet_token' }, 401);

    // 3) 주소 정규화(EIP-55)
    let normalizedAddress: string;
    try {
      normalizedAddress = getAddress(payload.sub);
    } catch {
      return jsonWithCors({ error: 'invalid_wallet_address' }, 400);
    }

    // 4) 주소 기반 언링크
    const result = await env.DB.prepare(
      `DELETE FROM oauth2_web3_accounts
       WHERE LOWER(wallet_address) = LOWER(?)`
    )
      .bind(normalizedAddress)
      .run();

    return jsonWithCors({ ok: true, deleted: result.meta?.changes ?? 0 }, 200);
  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
