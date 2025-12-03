import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { listTrendingPersonaFragments } from '../../db/persona/fragments';
import { TrendingPersonaFragment } from '../../types/persona-fragments';
import { getPersonaProfile } from '../persona-profile';

export async function handleTrendingPersonaFragments(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = Math.min(Math.max(Number(limitParam) || 6, 1), 24);

    const base = await listTrendingPersonaFragments(env, limit);

    const enriched: TrendingPersonaFragment[] = await Promise.all(
      base.map(async (row) => {
        // Try to fetch persona profile for nice display name
        let displayName: string = row.personaAddress;
        try {
          const result = await getPersonaProfile(env, row.personaAddress);
          const p = result?.profile;
          if (p?.nickname) displayName = p.nickname;
        } catch {
          // ignore profile errors and keep address as name
        }

        return {
          personaAddress: row.personaAddress,
          name: displayName,
          currentSupply: row.currentSupply,
          holderCount: row.holderCount,
          lastPrice: row.lastPrice,
          lastBlockNumber: row.lastBlockNumber,
        };
      }),
    );

    return jsonWithCors({ personas: enriched });
  } catch (err) {
    console.error('[handleTrendingPersonaFragments]', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
