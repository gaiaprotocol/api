import {
  queryHeldPersonaFragmentsForHolder,
  queryPersonaFragmentsByAddress,
  queryTrendingPersonaFragments,
} from "../../db/persona/fragments";
import { createNotificationWithEnv } from "../notifications";

/**
 * Read-only persona fragment queries (no notifications).
 */
export const fetchPersonaFragmentsByAddressService = queryPersonaFragmentsByAddress;
export const fetchHeldPersonaFragmentsForHolderService =
  queryHeldPersonaFragmentsForHolder;
export const listTrendingPersonaFragmentsService = queryTrendingPersonaFragments;

/**
 * Handle a fragment trade event (e.g. from sync/contract-event.ts)
 * and dispatch notifications to persona owner and trader.
 */
export async function handlePersonaFragmentTradeNotification(
  env: Env,
  params: {
    persona: string;
    trader: string;
    isBuy: boolean;
    amount: string;
    price: string;
  },
) {
  const { persona, trader, isBuy, amount, price } = params;

  const personaOwner = persona;

  // Notify persona owner on buy
  if (isBuy) {
    await createNotificationWithEnv(env, {
      recipient: personaOwner,
      actor: trader,
      actorType: "wallet",
      notificationType: "persona.buy",
      targetId: persona,
      title: "New fragments bought",
      body: `${trader} bought ${amount} fragments`,
      metadata: params,
    });
  }

  // Notify trader about their own trade
  await createNotificationWithEnv(env, {
    recipient: trader,
    actor: trader,
    actorType: "wallet",
    notificationType: isBuy ? "trade.buy" : "trade.sell",
    targetId: persona,
    title: `You ${isBuy ? "bought" : "sold"} fragments`,
    body: `Persona: ${persona} / Amount: ${amount} / Price: ${price}`,
    metadata: params,
  });
}
