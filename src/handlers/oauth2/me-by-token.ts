import { corsHeaders, jsonWithCors, verifyToken } from "@gaiaprotocol/worker-common";
import { getAddress } from "viem";

export async function oauth2MeByToken(
  request: Request,
  env: Env,
  providerKey: string
): Promise<Response> {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
    }

    const token = auth.slice(7);
    const payload = await verifyToken(token, env);
    if (!payload?.sub) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
    }

    const normalizedAddress = getAddress(payload.sub);

    const row = await env.DB.prepare(
      `SELECT sub, token, linked_at, email, name, picture
      FROM oauth2_web3_accounts
      WHERE provider = ? AND wallet_address = ?`
    )
      .bind(providerKey, normalizedAddress)
      .first<{
        sub: string;
        token: string;
        linked_at: number;
        email: string | null;
        name: string | null;
        picture: string | null;
      }>();

    if (!row) {
      return jsonWithCors(
        { ok: false, error: 'no_account_linked', wallet_address: normalizedAddress },
        404,
      );
    }

    return jsonWithCors({
      ok: true,
      sub: row.sub,
      wallet_address: normalizedAddress,
      token: row.token,
      linked_at: row.linked_at,
      email: row.email,
      name: row.name,
      picture: row.picture,
    });
  } catch (err) {
    console.error(err);
    return jsonWithCors(
      { error: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
}
