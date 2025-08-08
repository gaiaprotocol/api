import { createPublicClient, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';

const NFT_ADDRESSES: Record<string, `0x${string}`> = {
  'gaia-protocol-gods': '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372',
};

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

type NftRow = {
  nft_address: string;
  token_id: number;
  holder: string;
  type?: string;
  gender?: string;
  parts?: string;
  image?: string;
};

type NftData = {
  collection: string;
  id: number;
  name: string;
  description?: string;
  image: string;
  external_url?: string;
  animation_url?: string;
  traits?: { [traitName: string]: string | number };
  parts?: { [partName: string]: string | number };
  holder: string;
};

function rowsToData(rows: NftRow[]) {
  const data: { [key: string]: NftData } = {};

  for (const row of rows) {
    const collection = Object.keys(NFT_ADDRESSES).find((key) =>
      NFT_ADDRESSES[key] === row.nft_address
    );
    if (!collection) throw new Error(`Unknown collection address: ${row.nft_address}`);

    let name;
    let image;
    let description;
    let external_url;
    let traits: { [traitName: string]: string } | undefined;

    let parts: { [partName: string]: string } = {};
    if (row.parts) parts = JSON.parse(row.parts);

    if (collection === 'gaia-protocol-gods') {
      name = 'God #' + row.token_id;
      image = `https://god-images.gaia.cc/${row.image}`;
      traits = {};
      if (row.type) traits['Type'] = row.type;
      if (row.gender) traits['Gender'] = row.gender;
      external_url = 'https://gods.gaia.cc/';
    }

    data[`${collection}:${row.token_id}`] = {
      collection,
      id: row.token_id,
      name: name ? name : `#${row.token_id}`,
      description: description ? description : `#${row.token_id}`,
      image: image ? image : '',
      external_url: external_url ? external_url : '',
      traits,
      parts,
      holder: row.holder,
    };
  }

  return data;
}

async function fetchHeldNftData(env: Env, address: string) {
  const sql =
    `SELECT nft_address, token_id, holder, type, gender, parts, image \n` +
    `FROM nfts \n` +
    `WHERE holder = ?`;

  const stmt = env.DB.prepare(sql).bind(address);
  const { results } = await stmt.all<NftRow>();

  return rowsToData(results);
}

export { isHolder, fetchHeldNftData };
