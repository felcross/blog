import { ApiError, apiGet, apiSend, isApiError } from "@/shared/api";
import type { AdminPost, AdminPostInput, Paginated, PostStatus } from "./types";

const PAGE_SIZE = 20;

export function fetchAdminPosts(params: {
  status: PostStatus | null;
  page: number;
}): Promise<Paginated<AdminPost>> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  search.set("page", String(params.page));
  search.set("limit", String(PAGE_SIZE));
  return apiGet<Paginated<AdminPost>>(`/admin/posts?${search.toString()}`);
}

export async function fetchAdminPost(id: string): Promise<AdminPost> {
  try {
    return await apiGet<AdminPost>(`/admin/posts/${encodeURIComponent(id)}`);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      throw new ApiError("POST_NOT_FOUND", "Post not found", 404);
    }
    throw error;
  }
}

export function createAdminPost(input: AdminPostInput): Promise<AdminPost> {
  return apiSend<AdminPost>("/admin/posts", "POST", { body: input });
}

export function updateAdminPost(id: string, input: Partial<AdminPostInput>): Promise<AdminPost> {
  return apiSend<AdminPost>(`/admin/posts/${encodeURIComponent(id)}`, "PUT", { body: input });
}

export function deleteAdminPost(id: string): Promise<void> {
  return apiSend<void>(`/admin/posts/${encodeURIComponent(id)}`, "DELETE");
}

export function publishAdminPost(id: string): Promise<AdminPost> {
  return apiSend<AdminPost>(`/admin/posts/${encodeURIComponent(id)}/publish`, "POST");
}

export function unpublishAdminPost(id: string): Promise<AdminPost> {
  return apiSend<AdminPost>(`/admin/posts/${encodeURIComponent(id)}/unpublish`, "POST");
}

export const ADMIN_POSTS_PAGE_SIZE = PAGE_SIZE;
