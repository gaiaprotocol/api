import {
  ExploreSortKey,
  queryHeldPersonaFragmentsForHolder,
  queryPersonaFragmentsByAddress,
  queryTrendingPersonaFragments,
} from "../../db/persona/fragments";

export const fetchPersonaFragmentsByAddressService =
  queryPersonaFragmentsByAddress;

export const fetchHeldPersonaFragmentsForHolderService =
  queryHeldPersonaFragmentsForHolder;

export async function listTrendingPersonaFragmentsService(
  env: Env,
  limit: number,
  sort: ExploreSortKey,
) {
  return queryTrendingPersonaFragments(env, limit, sort);
}
