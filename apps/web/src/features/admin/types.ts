export type PostStatus = "DRAFT" | "PUBLISHED";

export interface AdminPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminPostInput {
  title: string;
  slug: string;
  excerpt?: string;
  content: string;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
