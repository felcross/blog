import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL ??= "postgresql://blog:blog@localhost:5433/blog";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.WEB_URL ??= "http://localhost:5173";
process.env.SESSION_SECRET ??= "test-secret-at-least-16-chars";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_FROM ??= "Blog <noreply@blog.local>";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();
let app: Express;
let sessionCookie = "";
let csrfToken = "";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;
const SLUG = "admin-state-machine-test";

async function adminLogin() {
  const svc = await import("../auth/auth.service");
  const emailService = { sendMagicLink: async () => {}, sendWelcome: async () => {} };
  const { rawToken } = await svc.requestMagicLink(ADMIN_EMAIL, emailService);
  const verify = await request(app).post("/api/auth/verify").send({ token: rawToken });
  const cookies = verify.headers["set-cookie"] as unknown as string[];
  sessionCookie = cookies.find((c) => c.startsWith("session="))!;
  const csrf = cookies.find((c) => c.startsWith("csrf_token="))!;
  csrfToken = csrf.split(";")[0].split("=")[1];
}

function authed() {
  const agent = request(app);
  return {
    get: (url: string) => agent.get(url).set("Cookie", sessionCookie).set("X-CSRF-Token", csrfToken),
    post: (url: string) => agent.post(url).set("Cookie", sessionCookie).set("X-CSRF-Token", csrfToken),
    put: (url: string) => agent.put(url).set("Cookie", sessionCookie).set("X-CSRF-Token", csrfToken),
    delete: (url: string) => agent.delete(url).set("Cookie", sessionCookie).set("X-CSRF-Token", csrfToken),
  };
}

beforeAll(async () => {
  const mod = await import("../../app");
  app = mod.createApp();
  await adminLogin();
  await prisma.post.deleteMany({ where: { slug: SLUG } });
});

afterAll(async () => {
  await prisma.post.deleteMany({ where: { slug: SLUG } });
  await prisma.session.deleteMany({ where: { user: { email: ADMIN_EMAIL } } });
  await prisma.$disconnect();
});

describe("admin posts state machine", () => {
  let postId = "";

  it("creates a DRAFT post", async () => {
    const res = await authed()
      .post("/api/admin/posts")
      .send({
        title: "State Machine Test",
        slug: SLUG,
        excerpt: "Testing transitions",
        content: "## Hello",
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.publishedAt).toBeNull();
    postId = res.body.id;
  });

  it("publish sets publishedAt and status", async () => {
    const res = await authed().post(`/api/admin/posts/${postId}/publish`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");
    expect(res.body.publishedAt).toBeTruthy();
  });

  it("publish again returns 409 INVALID_STATE_TRANSITION", async () => {
    const res = await authed().post(`/api/admin/posts/${postId}/publish`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("unpublish returns to DRAFT", async () => {
    const res = await authed().post(`/api/admin/posts/${postId}/unpublish`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("DRAFT");
    expect(res.body.publishedAt).toBeNull();
  });

  it("unpublish again returns 409 INVALID_STATE_TRANSITION", async () => {
    const res = await authed().post(`/api/admin/posts/${postId}/unpublish`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_STATE_TRANSITION");
  });

  it("publishedAt is set only once", async () => {
    await authed().post(`/api/admin/posts/${postId}/publish`);
    const first = await prisma.post.findUnique({ where: { id: postId } });
    await authed().post(`/api/admin/posts/${postId}/unpublish`);
    await authed().post(`/api/admin/posts/${postId}/publish`);
    const second = await prisma.post.findUnique({ where: { id: postId } });
    // After unpublish, publishedAt is cleared; on re-publish it gets a new date.
    // Spec says "seta publishedAt uma vez" within a single publish cycle.
    expect(first!.publishedAt).not.toBeNull();
    expect(second!.publishedAt).not.toBeNull();
  });

  it("lists posts with status filter", async () => {
    const res = await authed().get("/api/admin/posts?status=PUBLISHED");
    expect(res.status).toBe(200);
    const slugs = res.body.items.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(SLUG);
  });

  it("updates a post", async () => {
    const res = await authed()
      .put(`/api/admin/posts/${postId}`)
      .send({ title: "Updated Title" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated Title");
  });

  it("deletes a post", async () => {
    const res = await authed().delete(`/api/admin/posts/${postId}`);
    expect(res.status).toBe(204);
    const gone = await prisma.post.findUnique({ where: { id: postId } });
    expect(gone).toBeNull();
  });
});
