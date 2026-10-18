import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Worker, type Job } from "bullmq";

process.env.DATABASE_URL ??= "postgresql://blog:blog@localhost:5433/blog";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.WEB_URL ??= "http://localhost:5173";
process.env.SESSION_SECRET ??= "test-secret-at-least-16-chars";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_FROM ??= "Blog <noreply@blog.local>";
process.env.NODE_ENV = "test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.EMAIL_BACKOFF_MS ??= "20";

describe("email job retry and DLQ", () => {
  let connectionMod: typeof import("./connection.js");
  let emailQueueMod: typeof import("./email.queue.js");
  let queue: import("bullmq").Queue;
  let dlq: import("bullmq").Queue;
  let worker: Worker;

  beforeAll(async () => {
    connectionMod = await import("./connection.js");
    emailQueueMod = await import("./email.queue.js");
    queue = emailQueueMod.getEmailQueue();
    dlq = emailQueueMod.getEmailDlq();
    await queue.drain(true);
    await dlq.drain(true);
  });

  afterAll(async () => {
    await worker?.close();
    await queue.drain(true);
    await dlq.drain(true);
    await queue.close();
    await dlq.close();
    await connectionMod.closeRedisConnection();
  });

  it("retries with backoff then succeeds on third attempt", async () => {
    let attempts = 0;
    const failuresUntil = 2;

    worker = new Worker(
      emailQueueMod.EMAIL_QUEUE_NAME,
      async (_job: Job) => {
        attempts += 1;
        if (attempts <= failuresUntil) {
          throw new Error("transient SMTP failure");
        }
      },
      {
        connection: connectionMod.getRedisConnection(),
        concurrency: 1,
      },
    );

    const failed: Error[] = [];
    worker.on("failed", (_job, err) => failed.push(err));

    await queue.add(
      "magic-link",
      {
        email: "retry@example.com",
        url: "https://example.com/verify?token=retry-token",
        requestId: "req-retry",
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 20 },
        removeOnComplete: true,
        removeOnFail: { age: 3600 },
        jobId: "magic-link.retry-token-id",
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 800));
    expect(attempts).toBe(3);
    // 2 failures then success — job should be completed (removed)
    const remaining = await queue.getJobs(["waiting", "active", "delayed", "failed"]);
    expect(remaining.find((j) => j.id === "magic-link.retry-token-id")).toBeUndefined();
    await worker.close();
    worker = undefined as unknown as Worker;
  });

  it("exhausted jobs produce a masked DLQ entry without url/token", async () => {
    let attempts = 0;
    worker = new Worker(
      emailQueueMod.EMAIL_QUEUE_NAME,
      async () => {
        attempts += 1;
        throw new Error("SMTP permanently down");
      },
      {
        connection: connectionMod.getRedisConnection(),
        concurrency: 1,
      },
    );

    const exhausted: Job[] = [];
    worker.on("failed", (job, err) => {
      const max = job?.opts.attempts ?? 3;
      if (job && job.attemptsMade >= max) {
        exhausted.push(job);
        const data = job.data as { email?: string; requestId?: string; url?: string };
        void dlq.add(
          "email-failed",
          {
            jobName: String(job.name),
            maskedEmail: data.email
              ? `${data.email[0]}***${data.email.slice(data.email.indexOf("@"))}`
              : "***",
            requestId: data.requestId ?? "unknown",
            jobId: String(job.id),
            attemptsMade: job.attemptsMade,
            reason: err.message,
            failedAt: new Date().toISOString(),
          },
          { removeOnComplete: false, removeOnFail: { age: 30 * 24 * 3600 } },
        );
      }
    });

    await queue.add(
      "magic-link",
      {
        email: "always-fail@example.com",
        url: "https://example.com/verify?token=NEVER-LOG-ME",
        requestId: "req-fail",
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 20 },
        removeOnComplete: true,
        removeOnFail: { age: 3600 },
        jobId: "magic-link.fail-token-id",
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(attempts).toBe(3);
    expect(exhausted).toHaveLength(1);

    const dlqJobs = await dlq.getJobs(["waiting", "active", "delayed", "failed"]);
    const raw = JSON.stringify(dlqJobs.map((j) => j.data));
    expect(raw).toContain("a***@example.com");
    expect(raw).not.toContain("NEVER-LOG-ME");
    expect(raw).not.toContain("https://example.com/verify");
    expect(raw).not.toContain("always-fail@example.com");

    await worker.close();
    worker = undefined as unknown as Worker;
  });
});
