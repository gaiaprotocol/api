export interface Notice {
  id: number;
  type?: string;
  title: string;
  content: string;
  createdAt: number;
  // Example: { "en": { "title": "...", "content": "..." }, "ko": { ... } }
  translations?: Record<string, Record<string, string>>;
}

export type NoticeRow = {
  id: number;
  type?: string;
  title: string;
  content: string;
  created_at: number;
  translations?: string; // JSON string
};

export function rowToNotice(row: NoticeRow): Notice {
  const notice: Notice = {
    id: row.id,
    type: row.type,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
  };

  if (row.translations) {
    try {
      notice.translations = JSON.parse(row.translations);
    } catch (err) {
      console.error("Failed to parse notice.translations", err);
    }
  }

  return notice;
}
