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

const AUTH_EMAIL = "routes-auth-test@example.com";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL!;

beforeAll(async () => {
  const mod = await import("../../app");
  app = mod.createApp();
  await prisma.loginToken.deleteMany({
    where: { email: { in: [AUTH_EMAIL, ADMIN_EMAIL] } },
  });
});

afterAll(async () => {
  await prisma.loginToken.deleteMany({
    where: { email: { in: [AUTH_EMAIL, ADMIN_EMAIL] } },
  });
  await prisma.$disconnect();
});

async function loginAs(email: string) {
  const magic = await request(app)
    .post("/api/auth/magic-link")
    .send({ email });
  expect(magic.status).toBe(202);

  // Pull the raw token from the DB service path: request another link
  // and grab from FakeEmailService is not exposed here, so use the service directly
  const svc = await import("./auth.service");
  const emailService = { sendMagicLink: async () => {}, sendWelcome: async () => {} };
  const { rawToken } = await svc.requestMagicLink(email, emailService);

  const verify = await request(app).post("/api/auth/verify").send({ token: rawToken });
  return verify;
}

describe("POST /api/auth/magic-link", () => {
  it("always returns 202 (uniform)", async () => {
    const res = await request(app)
      .post("/api/auth/magic-link")
      .send({ email: AUTH_EMAIL });
    expect(res.status).toBe(202);
    expect(res.body.ok).toBe(true);
  });

  it("rejects invalid email with VALIDATION_ERROR", async () => {
    const res = await request(app)
      .post("/api/auth/magic-link")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/auth/verify", () => {
  it("rejects invalid token with INVALID_TOKEN", async () => {
    const res = await request(app)
      .post("/api/auth/verify")
      .send({ token: "0".repeat(64) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_TOKEN");
    expect(res.body.error.requestId).toBeTruthy();
  });

  it("sets httpOnly session cookie and readable csrf cookie", async () => {
    const verify = await loginAs(AUTH_EMAIL);
    expect(verify.status).toBe(200);
    expect(verify.body.user.email).toBe(AUTH_EMAIL);

    const cookies = verify.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("session="));
    const csrf = cookies.find((c) => c.startsWith("csrf_token="));
    expect(session).toBeTruthy();
    expect(session!.toLowerCase()).toContain("httponly");
    expect(csrf).toBeTruthy();
    expect(csrf!.toLowerCase()).not.toContain("httponly");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 without session", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns user with valid session cookie", async () => {
    const verify = await loginAs(AUTH_EMAIL);
    const cookies = verify.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("session="))!;

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", session);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(AUTH_EMAIL);
    expect(res.body.csrfToken).toBeTruthy();
  });
});

describe("POST /api/auth/logout", () => {
  it("destroys session", async () => {
    const verify = await loginAs(AUTH_EMAIL);
    const cookies = verify.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("session="))!;
    const csrf = cookies.find((c) => c.startsWith("csrf_token="))!;
    const csrfValue = csrf.split(";")[0].split("=")[1];

    const logout = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", session)
      .set("X-CSRF-Token", csrfValue);
    expect(logout.status).toBe(204);

    const me = await request(app)
      .get("/api/auth/me")
      .set("Cookie", session);
    expect(me.status).toBe(401);
  });
});

describe("authorization matrix", () => {
  it("USER gets 403 on admin routes", async () => {
    const verify = await loginAs(AUTH_EMAIL);
    const cookies = verify.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("session="))!;
    const csrf = cookies.find((c) => c.startsWith("csrf_token="))!;
    const csrfValue = csrf.split(";")[0].split("=")[1];

    const res = await request(app)
      .get("/api/admin/posts")
      .set("Cookie", session)
      .set("X-CSRF-Token", csrfValue);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("no session gets 401 on admin routes", async () => {
    const res = await request(app).get("/api/admin/posts");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("missing CSRF token gets 403 on mutations", async () => {
    const verify = await loginAs(ADMIN_EMAIL);
    const cookies = verify.headers["set-cookie"] as unknown as string[];
    const session = cookies.find((c) => c.startsWith("session="))!;

    const res = await request(app)
      .post("/api/admin/posts")
      .set("Cookie", session)
      .send({ title: "x", slug: "x", content: "x" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });
});
