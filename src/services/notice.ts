import { Notice } from "../types/notice";

type NoticeRow = {
  id: number;
  title: string;
  content: string;
  created_at: number;
};

function rowToNotice(row: NoticeRow): Notice {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
  };
}

export async function fetchNotices(env: Env) {
  const sql = `
    SELECT id, title, content, created_at
    FROM notices
    ORDER BY id DESC
    LIMIT 10
  `;

  const stmt = env.DB.prepare(sql);
  const rows = await stmt.all<NoticeRow>();

  return rows.results.map(rowToNotice);
}
