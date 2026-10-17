export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface PostDetail extends PostSummary {
  content: string;
  author: { name: string | null; email: string };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
