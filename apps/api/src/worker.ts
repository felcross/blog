import { Worker, type Job } from "bullmq";
import { env } from "./config/env.js";
import { getLogger, runWithContext } from "./shared/context.js";
import { maskEmail } from "./shared/logger.js";
import { createSmtpEmailService } from "./shared/email.js";
import {
  closeRedisConnection,
  getRedisConnection,
  getEmailDlq,
  magicLinkPayloadSchema,
  welcomePayloadSchema,
  EMAIL_QUEUE_NAME,
  type EmailDlqEntry,
  type MagicLinkPayload,
  type WelcomePayload,
} from "./queues/index.js";
import { prisma } from "./shared/prisma.js";

const smtp = createSmtpEmailService();

async function handleMagicLink(payload: MagicLinkPayload): Promise<void> {
  const parsed = magicLinkPayloadSchema.parse(payload);
  await smtp.sendMagicLink(parsed.email, parsed.url);
}

async function handleWelcome(payload: WelcomePayload): Promise<void> {
  const parsed = welcomePayloadSchema.parse(payload);
  await smtp.sendWelcome(parsed.email, parsed.name);
}

async function recordDlq(
  job: Job,
  reason: string,
): Promise<void> {
  const data = (job.data ?? {}) as { email?: string; requestId?: string };
  const entry: EmailDlqEntry = {
    jobName: String(job.name),
    maskedEmail: data.email ? maskEmail(data.email) : "***",
    requestId: data.requestId ?? "unknown",
    jobId: String(job.id),
    attemptsMade: job.attemptsMade,
    reason,
    failedAt: new Date().toISOString(),
  };
  // DLQ entry must NEVER contain the URL or token — only the fields above.
  await getEmailDlq().add("email-failed", entry, {
    removeOnComplete: false,
    removeOnFail: { age: 30 * 24 * 3600 },
  });
  getLogger().error(
    {
      jobName: entry.jobName,
      jobId: entry.jobId,
      requestId: entry.requestId,
      maskedEmail: entry.maskedEmail,
      attemptsMade: entry.attemptsMade,
      reason: entry.reason,
    },
    "email job exhausted retries; moved to DLQ",
  );
}

async function processJob(job: Job): Promise<void> {
  const payload = job.data as { requestId?: string };
  const requestId = payload.requestId ?? "unknown";

  await runWithContext({ requestId, jobId: String(job.id) }, async () => {
    const log = getLogger();
    if (job.name === "magic-link") {
      await handleMagicLink(job.data as MagicLinkPayload);
      log.info(
        { jobName: job.name, jobId: job.id, email: maskEmail((job.data as MagicLinkPayload).email) },
        "email job completed",
      );
      return;
    }
    if (job.name === "welcome") {
      await handleWelcome(job.data as WelcomePayload);
      log.info(
        { jobName: job.name, jobId: job.id, email: maskEmail((job.data as WelcomePayload).email) },
        "email job completed",
      );
      return;
    }
    throw new Error(`Unknown job name: ${job.name}`);
  });
}

const worker = new Worker(EMAIL_QUEUE_NAME, processJob, {
  connection: getRedisConnection(),
  concurrency: env.EMAIL_WORKER_CONCURRENCY,
});

worker.on("completed", (job) => {
  getLogger().info({ jobId: job.id, jobName: job.name }, "job completed event");
});

worker.on("failed", (job, err) => {
  const attempts = job?.attemptsMade ?? 0;
  const max = job?.opts.attempts ?? 3;
  if (job && attempts >= max) {
    void recordDlq(job, err.message);
  } else {
    getLogger().warn(
      { jobId: job?.id, jobName: job?.name, attempts, err },
      "job failed event",
    );
  }
});

worker.on("stalled", (jobId) => {
  getLogger().warn({ jobId }, "job stalled event");
});

async function shutdown(signal: string): Promise<void> {
  getLogger().info({ signal }, "worker shutting down");
  try {
    await worker.close();
    await closeRedisConnection();
    await prisma.$disconnect();
  } catch (err) {
    getLogger().error({ err }, "error during worker shutdown");
  }
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  getLogger().fatal({ err }, "unhandledRejection in worker");
  void shutdown("unhandledRejection");
});

process.on("uncaughtException", (err) => {
  getLogger().fatal({ err }, "uncaughtException in worker");
  void shutdown("uncaughtException");
});

getLogger().info(
  { concurrency: env.EMAIL_WORKER_CONCURRENCY, redis: env.REDIS_URL.replace(/\/\/.*@/, "//***@") },
  "email worker started",
);
