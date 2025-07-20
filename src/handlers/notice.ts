export async function handleNotices(env: Env): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, title, content, created_at
      FROM notices
      ORDER BY id DESC
      LIMIT 10
    `).all();

    return jsonWithCors({
      success: true,
      data: results
    });
  } catch (err) {
    console.error(err);
    return jsonWithCors({
      success: false,
      error: 'Failed to fetch notices'
    }, 500);
  }
}

function jsonWithCors(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
