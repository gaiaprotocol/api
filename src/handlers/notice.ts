export async function handleNotices(env: Env): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, title, content, created_at
      FROM notices
      ORDER BY id DESC
      LIMIT 10
    `).all();

    return Response.json({
      success: true,
      data: results
    });
  } catch (err) {
    console.error(err);
    return Response.json({
      success: false,
      error: 'Failed to fetch notices'
    }, { status: 500 });
  }
}
