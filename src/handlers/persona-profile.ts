import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { getAddress } from 'viem';
import { z } from 'zod';

import { fetchProfileByAddress } from '../db/profile';
import {
  fetchPersonaFragmentsByAddressService,
} from '../services/persona/fragments';
import {
  listPersonaPostsService,
} from '../services/persona/post';
import type { Profile } from '../types/profile';

/**
 * Fetch persona profile data for a given wallet address.
 *
 * This function aggregates:
 * - Profile information
 * - Latest persona posts authored by the user
 * - Persona fragment (token) information
 *
 * If the profile does not exist, a minimal fallback profile is returned.
 */
export async function getPersonaProfile(env: Env, walletAddress: string) {
  const [profileRow, posts, personaFragments] = await Promise.all([
    // profile 은 아직 service 분리 안 했으니 db 그대로 사용
    fetchProfileByAddress(env, walletAddress),
    // posts 는 service 통해 조회
    listPersonaPostsService(env, {
      author: walletAddress,
      limit: 50,
      offset: 0,
    }),
    // fragments 도 service 통해 조회
    fetchPersonaFragmentsByAddressService(env, walletAddress),
  ]);

  const profile: Profile =
    profileRow ??
    {
      account: walletAddress,
      nickname: null,
      bio: null,
      avatarUrl: null,
      bannerUrl: null,
      socialLinks: null,
      createdAt: null,
      updatedAt: null,
    };

  return {
    profile,
    posts,
    personaFragments,
  };
}

/**
 * HTTP handler for persona profile requests.
 *
 * This endpoint:
 * - Validates the query parameter (?address=0x...)
 * - Normalizes the wallet address
 * - Delegates data fetching to getPersonaProfile
 * - Always returns 200 with a fallback profile if none exists
 */
export async function handlePersonaProfile(request: Request, env: Env) {
  try {
    const url = new URL(request.url);

    // Validate query parameter (?address=0x...)
    const schema = z.object({
      address: z.string().min(1, 'address is required'),
    });

    const parsed = schema.safeParse({
      address: url.searchParams.get('address'),
    });

    if (!parsed.success) {
      return jsonWithCors({ error: parsed.error.message }, 400);
    }

    // Normalize wallet address (checksum)
    const walletAddress = getAddress(parsed.data.address);

    // Delegate to domain-level function
    const personaProfile = await getPersonaProfile(env, walletAddress);

    // Always return 200 OK with profile + posts + fragment info
    return jsonWithCors(personaProfile, 200);
  } catch (err) {
    console.error('[handlePersonaProfile] error', err);
    return jsonWithCors({ error: 'Internal server error.' }, 500);
  }
}
