import { jsonWithCors } from '@gaiaprotocol/worker-common'

export async function handleGodsStats(_request: Request, env: Env) {
  try {
    // 1) DB 조회 Promise
    const dbPromise = env.DB.prepare(
      `SELECT time, floor_price, num_owners
       FROM gods_stats
       ORDER BY time ASC`
    ).all<{ time: string; floor_price: number; num_owners: number }>()

    // 2) OpenSea API Promise
    const openseaPromise = (async () => {
      try {
        const resp = await fetch(
          'https://api.opensea.io/api/v2/collections/gaia-protocol-gods/stats',
          { headers: { 'X-API-KEY': env.OPENSEA_API_KEY } }
        )
        if (!resp.ok) {
          console.warn('OpenSea API returned non-OK:', resp.status)
          return null
        }
        const data = await resp.json<{ total: { floor_price: number; num_owners: number } }>()
        return {
          floor_price: data?.total?.floor_price ?? null,
          num_owners: data?.total?.num_owners ?? null,
        }
      } catch (err) {
        console.error('Failed to fetch OpenSea stats:', err)
        return null
      }
    })()

    // 3) 병렬 실행
    const [{ results: dbStats }, currentStats] = await Promise.all([
      dbPromise,
      openseaPromise,
    ])

    // 4) 응답
    return jsonWithCors({
      stats: dbStats ?? [],
      current: currentStats,
    })
  } catch (err) {
    console.error('handleGodsStats error:', err)
    return jsonWithCors({ error: 'Internal server error.' }, 500)
  }
}
