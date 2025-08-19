import { jsonWithCors } from '@gaiaprotocol/worker-common';
import { z } from 'zod';

const TABLE_NAME = 'gaia_names';

const blacklist = [
  'gaia',
  'gaiaprotocol',
  'admin',
  'root',
  'null',
];

export async function handleSearchNames(request: Request, env: Env) {
  try {
    const body = await request.json();

    const schema = z.object({
      query: z.string().min(2, 'Query must be at least 2 characters'),
    });

    const { query } = schema.parse(body);
    const q = `%${query.toLowerCase()}%`;

    const stmt = `
      SELECT DISTINCT name FROM ${TABLE_NAME}
      WHERE LOWER(name) LIKE ?
      LIMIT 20
    `;

    const result = await env.DB.prepare(stmt).bind(q).all();

    const filtered = result.results
      .map((row: any) => row.name)
      .filter((name: string) => !blacklist.includes(name.toLowerCase()));

    return jsonWithCors(
      filtered.map(name => ({ name }))
    );

  } catch (err) {
    console.error(err);
    return jsonWithCors({ error: 'Invalid request or internal error' }, 400);
  }
}
