import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';

const BALANCE_ABI = [
  {
    type: 'function',
    name: 'balance',
    stateMutability: 'view',
    inputs: [
      { name: 'persona', type: 'address' },
      { name: 'user', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

export async function hasPersonaAccess(env: Env, persona: `0x${string}`, user: `0x${string}`) {
  // persona owner can always chat
  if (persona.toLowerCase() === user.toLowerCase()) return true;

  const chain = env.ENV_TYPE === 'prod' ? base : baseSepolia;
  const client = createPublicClient({ chain, transport: http() });

  const bal = (await client.readContract({
    address: env.PERSONA_FRAGMENTS_ADDRESS as `0x${string}`,
    abi: BALANCE_ABI,
    functionName: 'balance',
    args: [persona, user],
  })) as bigint;

  return bal > 0n;
}
