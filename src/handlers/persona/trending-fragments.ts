import { jsonWithCors } from '@gaiaprotocol/worker-common';
import type { ExploreSortKey } from '../../db/persona/fragments';
import { listTrendingPersonaFragmentsService } from '../../services/persona/fragments';
import { TrendingPersonaFragment } from '../../types/persona-fragments';
import { getPersonaProfile } from '../persona-profile';

function normalizeSortKey(raw: string | null): ExploreSortKey {
  switch (raw) {
    case 'holders':
    case 'volume':
    case 'price':
      return raw;
    case 'trending':
    default:
      return 'trending';
  }
}

export async function handleTrendingPersonaFragments(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const sortParam = url.searchParams.get('sort');

    const limit = Math.min(Math.max(Number(limitParam) || 6, 1), 100);
    const sortKey = normalizeSortKey(sortParam);

    const base = await listTrendingPersonaFragmentsService(env, limit, sortKey);

    const enriched: TrendingPersonaFragment[] = await Promise.all(
      base.map(async (row) => {
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
          volume24hWei: row.volume24hWei,
          change24hPct: row.change24hPct,
        };
      }),
    );

    return jsonWithCors({ personas: enriched });
  } catch (err) {
    console.error('[handleTrendingPersonaFragments]', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
