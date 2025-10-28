export interface Notice {
  id: number;
  type?: string;
  title: string;
  content: string;
  createdAt: number;
  translations?: Record<string, Record<string, string>>;
}