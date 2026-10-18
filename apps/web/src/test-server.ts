import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const postsPayload = {
  items: [
    {
      id: "1",
      slug: "hello-world",
      title: "Hello World",
      excerpt: "A short excerpt for testing.",
      publishedAt: "2026-01-15T00:00:00.000Z",
      updatedAt: "2026-01-15T00:00:00.000Z",
    },
    {
      id: "2",
      slug: "second-post",
      title: "Second Post",
      excerpt: "Another excerpt.",
      publishedAt: "2026-01-10T00:00:00.000Z",
      updatedAt: "2026-01-10T00:00:00.000Z",
    },
  ],
  page: 1,
  limit: 9,
  total: 2,
  totalPages: 1,
};

export const server = setupServer(
  http.get("/api/posts", () => HttpResponse.json(postsPayload)),
  http.get("/api/posts/:slug", ({ params }) => {
    if (params.slug === "hello-world") {
      return HttpResponse.json({
        id: "1",
        slug: "hello-world",
        title: "Hello World",
        excerpt: "A short excerpt for testing.",
        content: "## Hello\n\nThis is **markdown**.",
        publishedAt: "2026-01-15T00:00:00.000Z",
        updatedAt: "2026-01-15T00:00:00.000Z",
        author: { name: "Admin", email: "admin@example.com" },
      });
    }
    return HttpResponse.json(
      { error: { code: "POST_NOT_FOUND", message: "Post not found", requestId: "test" } },
      { status: 404 },
    );
  }),
);
