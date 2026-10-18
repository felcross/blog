import { describe, expect, it, beforeAll, afterAll, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";

process.env.DATABASE_URL ??= "postgresql://blog:blog@localhost:5433/blog";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.WEB_URL ??= "http://localhost:5173";
process.env.SESSION_SECRET ??= "test-secret-at-least-16-chars";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_FROM ??= "Blog <noreply@blog.local>";
process.env.NODE_ENV = "test";

const prisma = new PrismaClient();

const TEST_EMAIL = "auth-service-test@example.com";

function sha256(hex: string): string {
  return createHash("sha256").update(hex).digest("hex");
}

beforeAll(async () => {
  await prisma.loginToken.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.session.deleteMany({
    where: { user: { email: TEST_EMAIL } },
  });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
});

afterAll(async () => {
  await prisma.loginToken.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.session.deleteMany({
    where: { user: { email: TEST_EMAIL } },
  });
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("token hashing", () => {
  it("hashToken produces stable SHA-256 hex", async () => {
    const { hashToken } = await import("./auth.service");
    const raw = randomBytes(32).toString("hex");
    expect(hashToken(raw)).toBe(sha256(raw));
    expect(hashToken(raw)).toHaveLength(64);
    expect(hashToken(raw)).not.toBe(raw);
  });
});

describe("magic link lifecycle", () => {
  it("requestMagicLink stores only the hash, not the raw token", async () => {
    const svc = await import("./auth.service");
    const emailService = {
      sendMagicLink: vi.fn(async () => {}),
      sendWelcome: vi.fn(async () => {}),
    };
    const result = await svc.requestMagicLink(TEST_EMAIL, emailService);

    expect(emailService.sendMagicLink).toHaveBeenCalledTimes(1);
    const stored = await prisma.loginToken.findFirst({
      where: { email: TEST_EMAIL },
    });
    expect(stored).not.toBeNull();
    expect(stored!.tokenHash).toBe(sha256(result.rawToken));
    expect(stored!.tokenHash).not.toBe(result.rawToken);
    expect(stored!.usedAt).toBeNull();
  });

  it("verifyToken consumes the token and creates a session", async () => {
    const svc = await import("./auth.service");
    const emailService = { sendMagicLink: vi.fn(async () => {}), sendWelcome: vi.fn(async () => {}) };
    const { rawToken } = await svc.requestMagicLink(TEST_EMAIL, emailService);

    const result = await svc.verifyToken(rawToken);
    expect(result.user.email).toBe(TEST_EMAIL);
    expect(result.user.role).toBe("USER"); // not ADMIN_EMAIL
    expect(result.sessionRawToken).toBeTruthy();

    const stored = await prisma.loginToken.findFirst({
      where: { email: TEST_EMAIL },
    });
    expect(stored!.usedAt).not.toBeNull();
  });

  it("reuse of a consumed token fails", async () => {
    const svc = await import("./auth.service");
    const emailService = { sendMagicLink: vi.fn(async () => {}), sendWelcome: vi.fn(async () => {}) };
    const { rawToken } = await svc.requestMagicLink(TEST_EMAIL, emailService);
    await svc.verifyToken(rawToken);
    await expect(svc.verifyToken(rawToken)).rejects.toThrow();
  });

  it("expired token fails", async () => {
    const svc = await import("./auth.service");
    const emailService = { sendMagicLink: vi.fn(async () => {}), sendWelcome: vi.fn(async () => {}) };
    const { rawToken } = await svc.requestMagicLink(TEST_EMAIL, emailService);

    // Force expiry
    await prisma.loginToken.updateMany({
      where: { email: TEST_EMAIL, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(svc.verifyToken(rawToken)).rejects.toThrow();
  });

  it("unknown token fails", async () => {
    const svc = await import("./auth.service");
    await expect(svc.verifyToken("deadbeef".repeat(8))).rejects.toThrow();
  });
});

describe("session lifecycle", () => {
  it("getSessionUser returns user for valid session", async () => {
    const svc = await import("./auth.service");
    const emailService = { sendMagicLink: vi.fn(async () => {}), sendWelcome: vi.fn(async () => {}) };
    const { rawToken } = await svc.requestMagicLink(TEST_EMAIL, emailService);
    const { sessionRawToken, user } = await svc.verifyToken(rawToken);

    const found = await svc.getSessionUser(sessionRawToken);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(user.id);
  });

  it("destroySession invalidates the session", async () => {
    const svc = await import("./auth.service");
    const emailService = { sendMagicLink: vi.fn(async () => {}), sendWelcome: vi.fn(async () => {}) };
    const { rawToken } = await svc.requestMagicLink(TEST_EMAIL, emailService);
    const { sessionRawToken } = await svc.verifyToken(rawToken);

    await svc.destroySession(sessionRawToken);
    const found = await svc.getSessionUser(sessionRawToken);
    expect(found).toBeNull();
  });
});

describe("ADMIN_EMAIL bootstrap", () => {
  it("email matching ADMIN_EMAIL gets role ADMIN", async () => {
    const adminEmail = process.env.ADMIN_EMAIL!;
    const svc = await import("./auth.service");
    const emailService = { sendMagicLink: vi.fn(async () => {}), sendWelcome: vi.fn(async () => {}) };
    const { rawToken } = await svc.requestMagicLink(adminEmail, emailService);
    const { user } = await svc.verifyToken(rawToken);
    expect(user.role).toBe("ADMIN");

    // cleanup sessions for admin test
    await prisma.session.deleteMany({ where: { userId: user.id } });
  });
});

describe("EmailService swap", () => {
  it("auth.service works with any EmailService implementation", async () => {
    const sent: string[] = [];
    const custom = {
      sendMagicLink: async (email: string, link: string) => {
        sent.push(`${email} -> ${link}`);
      },
      sendWelcome: async () => {},
    };
    const svc = await import("./auth.service");
    await svc.requestMagicLink(TEST_EMAIL, custom);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain(TEST_EMAIL);
  });
});
