const NFT_ADDRESSES: Record<string, `0x${string}`> = {
  'gaia-protocol-gods': '0x134590ACB661Da2B318BcdE6b39eF5cF8208E372',
};

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

export async function getBulkNftData(env: Env, nfts: { collection: string; tokenId: number }[]) {
  const pairs: { address: string; tokenId: number }[] = [];
  for (const { collection, tokenId } of nfts) {
    const address = NFT_ADDRESSES[collection];
    if (!address) throw new Error(`Unknown collection: ${collection}`);
    pairs.push({ address, tokenId });
  }

  if (pairs.length > 0) {
    const placeholders = pairs.map(() => '(?, ?)').join(', ');
    const sql =
      `SELECT nft_address, token_id, holder, type, gender, parts, image \n` +
      `FROM nfts \n` +
      `WHERE (nft_address, token_id) IN (${placeholders})`;

    const bindValues: (string | number)[] = [];
    for (const { address, tokenId } of pairs) {
      bindValues.push(address, tokenId);
    }

    const stmt = env.DB.prepare(sql).bind(...bindValues);
    const { results } = await stmt.all<NftRow>();

    return rowsToData(results);
  }
  return {};
}

export async function fetchHeldNftData(env: Env, address: string) {
  const sql =
    `SELECT nft_address, token_id, holder, type, gender, parts, image \n` +
    `FROM nfts \n` +
    `WHERE holder = ?`;

  const stmt = env.DB.prepare(sql).bind(address);
  const { results } = await stmt.all<NftRow>();

  return rowsToData(results);
}

type Pair = { key: string; collection: string; tokenId: number; nftAddress: `0x${string}` };

function parseIdsOrThrow(rawIds: string[]): Pair[] {
  const pairs: Pair[] = [];
  const seen = new Set<string>();

  for (const raw of rawIds) {
    const trimmed = raw.trim();
    const hasCollection = trimmed.includes(':');

    const collection = hasCollection
      ? trimmed.split(':', 1)[0]
      : 'gaia-protocol-gods';

    const tokenPart = hasCollection
      ? trimmed.slice(collection.length + 1)
      : trimmed;

    if (!NFT_ADDRESSES[collection]) {
      throw new Error(`Unknown collection: ${collection}`);
    }
    if (!/^\d+$/.test(tokenPart)) {
      throw new Error(`Invalid token id: ${tokenPart}`);
    }

    const tokenId = Number(tokenPart);
    const nftAddress = NFT_ADDRESSES[collection];

    const key = `${collection}:${tokenId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    pairs.push({ key, collection, tokenId, nftAddress });
  }

  return pairs;
}

export async function fetchNftDataByIds(env: Env, ids: string[]) {
  const pairs = parseIdsOrThrow(ids);
  if (pairs.length === 0) return {};

  // WHERE (nft_address = ? AND token_id = ?) OR (...)
  const conditions = pairs.map(() => '(nft_address = ? AND token_id = ?)').join(' OR ');
  const binds: (string | number)[] = [];
  for (const p of pairs) {
    binds.push(p.nftAddress, p.tokenId);
  }

  const sql =
    `SELECT nft_address, token_id, holder, type, gender, parts, image \n` +
    `FROM nfts \n` +
    `WHERE ${conditions}`;

  const stmt = env.DB.prepare(sql).bind(...binds);
  const { results } = await stmt.all<{
    nft_address: `0x${string}`;
    token_id: number;
    holder: string;
    type?: string;
    gender?: string;
    parts?: string;
    image?: string;
  }>();

  // rowsToData는 전체 컬렉션의 키를 만들 수 있으므로,
  // 요청된 key만 필터링해서 반환
  const allMap = rowsToData(results ?? []);
  const requestedKeys = new Set(pairs.map(p => p.key));

  const filtered: Record<string, any> = {};
  for (const key of Object.keys(allMap)) {
    if (requestedKeys.has(key)) filtered[key] = allMap[key];
  }
  // 요청했지만 DB에 없었던 id는 명시적으로 null을 넣어줌
  for (const key of requestedKeys) {
    if (!(key in filtered)) filtered[key] = null;
  }

  return filtered;
}
