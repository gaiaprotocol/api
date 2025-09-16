class APIError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'APIError';
  }
}

export async function fetchAndStoreGodsStats(env: Env): Promise<void> {
  const apiKey = env.OPENSEA_API_KEY;
  if (!apiKey) throw new Error('Missing OPENSEA_API_KEY');

  const resp = await fetch(
    'https://api.opensea.io/api/v2/collections/gaia-protocol-gods/stats',
    { headers: { 'X-API-KEY': apiKey } }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new APIError(resp.status, `OpenSea API error: ${text}`);
  }

  const data = await resp.json<{ total: { floor_price: number; num_owners: number } }>();

  // UTC 기준 "정시"로 내림
  const now = new Date();
  const timeUTC = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(), // 정시
      0, 0, 0
    )
  );

  const floor_price: number = data?.total?.floor_price ?? null;
  const num_owners: number = data?.total?.num_owners ?? null;

  if (floor_price == null || num_owners == null) {
    throw new Error('Malformed OpenSea response: total.floor_price or total.num_owners missing');
  }

  // D1은 SQLite이므로 ISO 문자열로 저장(Primary Key TEXT)
  const timeIso = timeUTC.toISOString();

  // UPSERT (같은 time이면 갱신)
  const stmt = env.DB.prepare(
    `INSERT INTO gods_stats (time, floor_price, num_owners)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(time) DO UPDATE SET
       floor_price = excluded.floor_price,
       num_owners  = excluded.num_owners`
  ).bind(timeIso, floor_price, num_owners);

  await stmt.run();
}