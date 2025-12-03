import { jsonWithCors, verifyToken } from '@gaiaprotocol/worker-common';

type PersonaFragmentHoldingRow = {
  persona_address: string;
  balance: string;
  last_trade_price: string | null;
  last_trade_is_buy: number | null;
  holder_updated_at: number;

  current_supply: string;
  holder_count: number;
  last_price: string;
  last_is_buy: number;
  last_block_number: number;
  last_tx_hash: string;
  last_updated_at: number;
};

export async function handleHeldPersonaFragments(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const auth = request.headers.get('authorization');
    if (!auth?.startsWith('Bearer ')) {
      return jsonWithCors(
        { error: 'Missing or invalid authorization token.' },
        401,
      );
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

    const holderAddress = payload?.sub as string | undefined;
    if (!holderAddress) {
      return jsonWithCors({ error: 'Invalid token payload.' }, 401);
    }

    // balance != '0' 인 페르소나만
    const stmt = `
      SELECT
        ph.persona_address,
        ph.balance,
        ph.last_trade_price,
        ph.last_trade_is_buy,
        ph.updated_at       AS holder_updated_at,
        pf.current_supply,
        pf.holder_count,
        pf.last_price,
        pf.last_is_buy,
        pf.last_block_number,
        pf.last_tx_hash,
        pf.last_updated_at
      FROM persona_fragment_holders ph
      JOIN persona_fragments pf
        ON pf.persona_address = ph.persona_address
      WHERE ph.holder_address = ?
        AND ph.balance != '0'
      ORDER BY pf.last_block_number DESC
    `;

    const { results } = await env.DB.prepare(stmt)
      .bind(holderAddress)
      .all<PersonaFragmentHoldingRow>();

    const holdings = (results ?? []).map((row) => {
      const toNumber = (v: any): number | null => {
        if (v == null) return null;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : null;
      };

      return {
        personaAddress: row.persona_address,
        balance: row.balance,
        lastTradePrice: row.last_trade_price,
        lastTradeIsBuy:
          row.last_trade_is_buy == null
            ? null
            : (Number(row.last_trade_is_buy) as 0 | 1),
        holderUpdatedAt: toNumber(row.holder_updated_at) ?? 0,

        currentSupply: row.current_supply,
        holderCount: toNumber(row.holder_count) ?? 0,
        lastPrice: row.last_price,
        lastIsBuy: Number(row.last_is_buy) as 0 | 1,
        lastBlockNumber: toNumber(row.last_block_number) ?? 0,
        lastTxHash: row.last_tx_hash,
        lastUpdatedAt: toNumber(row.last_updated_at) ?? 0,
      };
    });

    return jsonWithCors({ holdings });
  } catch (err) {
    console.error('[handleHeldPersonaFragments] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
