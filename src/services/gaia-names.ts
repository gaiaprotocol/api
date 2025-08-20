export async function fetchGaiaName(env: Env, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const sql = `
    SELECT account, name
    FROM gaia_names
    WHERE name = ? COLLATE NOCASE
    LIMIT 1
  `;

  const stmt = env.DB.prepare(sql).bind(trimmed);
  const row = await stmt.first<{ account: string; name: string }>();

  return row ?? undefined;
}
