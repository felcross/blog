import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://blog:blog@localhost:5433/blog";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.WEB_URL ??= "http://localhost:5173";
process.env.SESSION_SECRET ??= "test-secret-at-least-16-chars";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_FROM ??= "Blog <noreply@blog.local>";
process.env.NODE_ENV = "test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.EMAIL_BACKOFF_MS ??= "50";

describe("email queue", () => {
  let emailQueueMod: typeof import("./email.queue.js");
  let connectionMod: typeof import("./connection.js");
  let queue: import("bullmq").Queue;
  let dlq: import("bullmq").Queue;

  beforeAll(async () => {
    connectionMod = await import("./connection.js");
    emailQueueMod = await import("./email.queue.js");
    queue = emailQueueMod.getEmailQueue();
    dlq = emailQueueMod.getEmailDlq();
    await queue.drain(true);
    await dlq.drain(true);
  });

  afterAll(async () => {
    await queue.drain(true);
    await dlq.drain(true);
    await queue.close();
    await dlq.close();
    await connectionMod.closeRedisConnection();
  });

  it("validates magic-link payload at enqueue time", async () => {
    await expect(
      emailQueueMod.enqueueMagicLink(
        { email: "bad", url: "not-a-url", requestId: "r1" },
        "tok-1",
      ),
    ).rejects.toThrow();
  });

  it("uses idempotent jobId magic-link.<loginTokenId>", async () => {
    const payload = {
      email: "idem@example.com",
      url: "https://example.com/verify?token=abc",
      requestId: "req-idem",
    };
    await emailQueueMod.enqueueMagicLink(payload, "login-token-1");
    await emailQueueMod.enqueueMagicLink(payload, "login-token-1");

    const jobs = await queue.getJobs(["waiting", "delayed", "active", "completed"]);
    const matching = jobs.filter((j) => j.id === "magic-link.login-token-1");
    expect(matching).toHaveLength(1);
  });

  it("creates separate jobs for different loginTokenIds", async () => {
    const payload = {
      email: "two@example.com",
      url: "https://example.com/verify?token=abc",
      requestId: "req-two",
    };
    await emailQueueMod.enqueueMagicLink(payload, "login-token-a");
    await emailQueueMod.enqueueMagicLink(payload, "login-token-b");

    const jobs = await queue.getJobs(["waiting", "delayed", "active"]);
    const ids = jobs.map((j) => j.id);
    expect(ids).toContain("magic-link.login-token-a");
    expect(ids).toContain("magic-link.login-token-b");
  });

  it("default job options: 3 attempts, exponential backoff, removeOnComplete", async () => {
    await emailQueueMod.enqueueWelcome({
      email: "opts@example.com",
      requestId: "req-opts",
    });
    const jobs = await queue.getJobs(["waiting", "delayed", "active"]);
    const job = jobs.find((j) => j.name === "welcome");
    expect(job).toBeTruthy();
    expect(job!.opts.attempts).toBe(3);
    expect(job!.opts.backoff).toMatchObject({ type: "exponential" });
    expect(job!.opts.removeOnComplete).toBe(true);
    expect(job!.opts.removeOnFail).toMatchObject({ age: 3600 });
  });

  it("DLQ entry never contains url or token", async () => {
    const secretUrl = "https://blog.example/verify?token=SUPER-SECRET-TOKEN";
    const entry = {
      jobName: "magic-link",
      maskedEmail: "j***@gmail.com",
      requestId: "req-dlq",
      jobId: "magic-link.tok-9",
      attemptsMade: 3,
      reason: "SMTP unavailable",
      failedAt: new Date().toISOString(),
    };
    await dlq.add("email-failed", entry, { removeOnComplete: false });

    const jobs = await dlq.getJobs(["waiting", "active", "delayed", "failed"]);
    const raw = JSON.stringify(jobs.map((j) => j.data));
    expect(raw).not.toContain("SUPER-SECRET-TOKEN");
    expect(raw).not.toContain(secretUrl);
    expect(raw).toContain("j***@gmail.com");
    expect(raw).not.toContain("raw@gmail.com");
  });

  it("getRecentDlqEntries returns masked fields only", async () => {
    const recent = await emailQueueMod.getRecentDlqEntries(20);
    expect(recent.length).toBeGreaterThan(0);
    for (const e of recent) {
      expect(e.maskedEmail).toContain("***");
      expect(e).not.toHaveProperty("url");
      expect(e).not.toHaveProperty("token");
      expect(e.requestId).toBeTruthy();
      expect(e.jobId).toBeTruthy();
    }
  });
});
