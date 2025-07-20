import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({ chain: mainnet, transport: http() });

const erc721Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)'
]);

async function isHolder(address: `0x${string}`, contract: `0x${string}`): Promise<boolean> {
  const balance = await client.readContract({
    address: contract,
    abi: erc721Abi,
    functionName: 'balanceOf',
    args: [address]
  });
  return balance > 0n;
}

export { isHolder };
