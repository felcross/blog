import { z } from "zod";

export const listAdminPostsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

export type ListAdminPostsQuery = z.infer<typeof listAdminPostsQuerySchema>;

export const createPostSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  excerpt: z.string().optional(),
  content: z.string().min(1),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  excerpt: z.string().optional(),
  content: z.string().min(1).optional(),
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;
