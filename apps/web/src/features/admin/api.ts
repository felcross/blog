import { ApiError, apiGet, apiSend } from "@/shared/api";
import type { AdminPost, AdminPostInput, Paginated, PostStatus } from "./types";

const PAGE_SIZE = 20;
const LOOKUP_LIMIT = 100;

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
  // The admin list contract returns full post content per item; there is no
  // dedicated GET-by-id endpoint, so locate the post through the list.
  const result = await apiGet<Paginated<AdminPost>>(
    `/admin/posts?limit=${LOOKUP_LIMIT}`,
  );
  const found = result.items.find((item) => item.id === id);
  if (!found) {
    throw new ApiError("POST_NOT_FOUND", "Post not found", 404);
  }
  return found;
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
