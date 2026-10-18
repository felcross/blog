import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { PrismaClient } from "@prisma/client";

// Env must be set before importing app (config/env is validated at load)
process.env.DATABASE_URL ??= "postgresql://blog:blog@localhost:5433/blog";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.WEB_URL ??= "http://localhost:5173";
process.env.SESSION_SECRET ??= "test-secret-at-least-16-chars";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_FROM ??= "Blog <noreply@blog.local>";
process.env.PORT ??= "3001";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();

let app: Express;

beforeAll(async () => {
  const mod = await import("../../app");
  app = mod.createApp();

  await prisma.user.upsert({
    where: { email: "e2e-test@example.com" },
    update: {},
    create: { id: "e2e-test-admin", email: "e2e-test@example.com", role: "ADMIN" },
  });

  await prisma.post.deleteMany({
    where: { slug: { in: ["e2e-published", "e2e-draft"] } },
  });

  await prisma.post.create({
    data: {
      slug: "e2e-published",
      title: "E2E Published",
      excerpt: "Visible post",
      content: "## Hello",
      status: "PUBLISHED",
      publishedAt: new Date("2026-01-15"),
      authorId: "e2e-test-admin",
    },
  });

  await prisma.post.create({
    data: {
      slug: "e2e-draft",
      title: "E2E Draft",
      excerpt: "Hidden post",
      content: "## Hidden",
      status: "DRAFT",
      authorId: "e2e-test-admin",
    },
  });
});

afterAll(async () => {
  await prisma.post.deleteMany({
    where: { slug: { in: ["e2e-published", "e2e-draft"] } },
  });
  await prisma.user.deleteMany({ where: { id: "e2e-test-admin" } });
  await prisma.$disconnect();
});

describe("GET /api/health", () => {
  it("returns ok without touching dependencies", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});

describe("GET /api/health/ready", () => {
  it("returns ok when database is up", async () => {
    const res = await request(app).get("/api/health/ready");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.checks.database).toBe("up");
  });
});

describe("GET /api/posts", () => {
  it("lists only published posts with pagination envelope", async () => {
    const res = await request(app).get("/api/posts");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, limit: 10 });
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);

    const slugs = res.body.items.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain("e2e-published");
    expect(slugs).not.toContain("e2e-draft");
  });

  it("rejects invalid limit with VALIDATION_ERROR", async () => {
    const res = await request(app).get("/api/posts?limit=abc");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects limit above max", async () => {
    const res = await request(app).get("/api/posts?limit=999");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("sets x-request-id on every response", async () => {
    const res = await request(app).get("/api/posts");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });
});

describe("GET /api/posts/:slug", () => {
  it("returns a published post", async () => {
    const res = await request(app).get("/api/posts/e2e-published");
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe("e2e-published");
    expect(res.body.content).toContain("Hello");
    expect(res.body.author).toBeDefined();
  });

  it("returns 404 for drafts", async () => {
    const res = await request(app).get("/api/posts/e2e-draft");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("POST_NOT_FOUND");
    expect(res.body.error.requestId).toBeTruthy();
  });

  it("returns 404 for unknown slug", async () => {
    const res = await request(app).get("/api/posts/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("POST_NOT_FOUND");
    expect(res.body.error.requestId).toBeTruthy();
  });
});
