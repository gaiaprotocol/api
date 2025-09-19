import { Notice } from "../types/notice";

type NoticeRow = {
  id: number;
  title: string;
  content: string;
  created_at: number;
  translations?: string;
};

function rowToNotice(row: NoticeRow): Notice {
  const notice: Notice = {
    id: row.id,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
  };

  if (row.translations) {
    try {
      notice.translations = JSON.parse(row.translations);
    } catch (err) {
      console.error(err);
    }
  }

  return notice;
}

export async function fetchNotices(env: Env) {
  const sql = `
    SELECT id, title, content, created_at, translations
    FROM notices
    ORDER BY id DESC
    LIMIT 10
  `;

  const stmt = env.DB.prepare(sql);
  const rows = await stmt.all<NoticeRow>();

  return rows.results.map(rowToNotice);
}

export async function fetchNotice(env: Env, id: number) {
  const sql = `
    SELECT id, title, content, created_at
    FROM notices
    WHERE id = ?
    LIMIT 1
  `;

  const stmt = env.DB.prepare(sql).bind(id);
  const row = await stmt.first<NoticeRow>();

  return row ? rowToNotice(row) : undefined;
}
