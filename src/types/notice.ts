export interface Notice {
  id: number;
  title: string;
  content: string;
  createdAt: number;
  translations?: Record<string, string>;
}