import type {
  PersonaFragmentHolding,
  PersonaFragments,
  TrendingPersonaFragment,
} from "../../types/persona-fragments";

import {
  type ExploreSortKey,
  queryHeldPersonaFragmentsForHolder,
  queryPersonaFragmentsByAddress,
  queryTrendingPersonaFragments,
} from "../../db/persona/fragments";

/**
 * 단일 페르소나(지갑 주소)에 대한 fragments 정보 조회 서비스.
 */
export async function fetchPersonaFragmentsByAddressService(
  env: Env,
  account: string,
): Promise<PersonaFragments | null> {
  return queryPersonaFragmentsByAddress(env, account);
}

/**
 * 특정 홀더가 보유 중인 모든 페르소나 조각 조회 서비스.
 * - 각 holding에는 name, avatarUrl 이 이미 포함되어 있음
 *   (DB 레이어에서 profiles 를 JOIN 해서 채운 상태)
 */
export async function fetchHeldPersonaFragmentsForHolderService(
  env: Env,
  holderAddress: string,
): Promise<PersonaFragmentHolding[]> {
  return queryHeldPersonaFragmentsForHolder(env, holderAddress);
}

/**
 * 트렌딩 / 탐색용 페르소나 리스트 조회 서비스.
 * - DB 레이어에서 24h volume/change 통계까지 계산해서 반환
 * - name 필드는 핸들러에서 profile 기반으로 덮어쓸 수 있음
 */
export async function listTrendingPersonaFragmentsService(
  env: Env,
  limit: number,
  sort: ExploreSortKey,
): Promise<TrendingPersonaFragment[]> {
  return queryTrendingPersonaFragments(env, limit, sort);
}

// 정렬 키 타입도 그대로 re-export 해두면 상위 레이어에서 사용하기 편함
export type { ExploreSortKey };
