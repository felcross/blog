import { Prisma, type Post, type PostStatus } from "@prisma/client";
import { AppError, mapPrismaError } from "../../shared/errors/index.js";
import { prisma } from "../../shared/prisma.js";
import type { Paginated } from "../posts/posts.service.js";
import type {
  CreatePostInput,
  ListAdminPostsQuery,
  UpdatePostInput,
} from "./admin.schemas.js";

export interface AdminPostSummary {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  status: PostStatus;
  publishedAt: string | null;
  updatedAt: string;
}

export interface AdminPostDetail extends AdminPostSummary {
  content: string;
}

function toSummary(post: Post): AdminPostSummary {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    excerpt: post.excerpt,
    status: post.status,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    updatedAt: post.updatedAt.toISOString(),
  };
}

function toDetail(post: Post): AdminPostDetail {
  return { ...toSummary(post), content: post.content };
}

function isUniqueViolation(err: unknown): boolean {
  return mapPrismaError(err)?.code === "CONFLICT";
}

export async function listPosts(
  query: ListAdminPostsQuery,
): Promise<Paginated<AdminPostSummary>> {
  const where: Prisma.PostWhereInput = query.status
    ? { status: query.status }
    : {};

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
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

export async function getPostById(id: string): Promise<AdminPostDetail> {
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    throw new AppError("POST_NOT_FOUND");
  }
  return toDetail(post);
}

export async function createPost(
  input: CreatePostInput,
  authorId: string,
): Promise<AdminPostDetail> {
  try {
    const post = await prisma.post.create({
      data: {
        title: input.title,
        slug: input.slug,
        excerpt: input.excerpt ?? null,
        content: input.content,
        status: "DRAFT",
        authorId,
      },
    });
    return toDetail(post);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", "Slug already in use");
    }
    throw err;
  }
}

export async function updatePost(
  id: string,
  input: UpdatePostInput,
): Promise<AdminPostDetail> {
  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    throw new AppError("POST_NOT_FOUND");
  }

  const data: Prisma.PostUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.slug !== undefined) data.slug = input.slug;
  if (input.excerpt !== undefined) data.excerpt = input.excerpt;
  if (input.content !== undefined) data.content = input.content;

  try {
    const post = await prisma.post.update({ where: { id }, data });
    return toDetail(post);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError("CONFLICT", "Slug already in use");
    }
    throw err;
  }
}

export async function deletePost(id: string): Promise<void> {
  const result = await prisma.post.deleteMany({ where: { id } });
  if (result.count === 0) {
    throw new AppError("POST_NOT_FOUND");
  }
}

export async function publishPost(id: string): Promise<AdminPostDetail> {
  return prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id } });
    if (!post) {
      throw new AppError("POST_NOT_FOUND");
    }
    if (post.status === "PUBLISHED") {
      throw new AppError("INVALID_STATE_TRANSITION", "Post is already published");
    }

    const updated = await tx.post.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: post.publishedAt ?? new Date(),
      },
    });
    return toDetail(updated);
  });
}

export async function unpublishPost(id: string): Promise<AdminPostDetail> {
  return prisma.$transaction(async (tx) => {
    const post = await tx.post.findUnique({ where: { id } });
    if (!post) {
      throw new AppError("POST_NOT_FOUND");
    }
    if (post.status === "DRAFT") {
      throw new AppError("INVALID_STATE_TRANSITION", "Post is already a draft");
    }

    const updated = await tx.post.update({
      where: { id },
      data: { status: "DRAFT", publishedAt: null },
    });
    return toDetail(updated);
  });
}
