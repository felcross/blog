import type { Post, Prisma } from "@prisma/client";
import { prisma } from "../../shared/prisma.js";
import type { ListPostsQuery } from "./posts.schemas.js";

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

function toSummary(post: Post): PostSummary {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    updatedAt: post.updatedAt.toISOString(),
  };
}

export async function listPublishedPosts(
  query: ListPostsQuery,
): Promise<Paginated<PostSummary>> {
  const where: Prisma.PostWhereInput = { status: "PUBLISHED" };
  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    }),
  ]);

  return {
    items: posts.map(toSummary),
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getPublishedPostBySlug(slug: string): Promise<PostDetail | null> {
  const post = await prisma.post.findUnique({
    where: { slug },
    include: { author: { select: { name: true, email: true } } },
  });

  // Drafts and unknown slugs both 404 — never leak existence
  if (!post || post.status !== "PUBLISHED") {
    return null;
  }

  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    content: post.content,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    updatedAt: post.updatedAt.toISOString(),
    author: post.author,
  };
}
