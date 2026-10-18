import { Queue, type JobsOptions } from "bullmq";
import { z } from "zod";
import { env } from "../config/env.js";
import { getRedisConnection } from "./connection.js";

export const EMAIL_QUEUE_NAME = "email";
export const EMAIL_DLQ_NAME = "email-dlq";

export const magicLinkPayloadSchema = z.object({
  email: z.string().email(),
  url: z.string().url(),
  requestId: z.string().min(1),
});

export const welcomePayloadSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  requestId: z.string().min(1),
});

export type MagicLinkPayload = z.infer<typeof magicLinkPayloadSchema>;
export type WelcomePayload = z.infer<typeof welcomePayloadSchema>;

export type EmailJobName = "magic-link" | "welcome";
export type EmailJobPayload = MagicLinkPayload | WelcomePayload;

export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: env.EMAIL_BACKOFF_MS,
  },
  removeOnComplete: true,
  removeOnFail: { age: 3600 },
};

let emailQueue: Queue | undefined;
let dlq: Queue | undefined;

export function getEmailQueue(): Queue {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions,
    });
  }
  return emailQueue;
}

export function getEmailDlq(): Queue {
  if (!dlq) {
    dlq = new Queue(EMAIL_DLQ_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        removeOnComplete: false,
        // retain DLQ entries for 30 days
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
  }
  return dlq;
}

export interface EmailDlqEntry {
  jobName: string;
  maskedEmail: string;
  requestId: string;
  jobId: string;
  attemptsMade: number;
  reason: string;
  failedAt: string;
}

export async function enqueueMagicLink(
  payload: MagicLinkPayload,
  loginTokenId: string,
): Promise<void> {
  const parsed = magicLinkPayloadSchema.parse(payload);
  // BullMQ custom jobIds cannot contain ":". Spec form is magic-link:<loginTokenId>;
  // we use the equivalent magic-link.<loginTokenId> for idempotency.
  await getEmailQueue().add("magic-link", parsed, {
    ...defaultJobOptions,
    jobId: `magic-link.${loginTokenId}`,
  });
}

export async function enqueueWelcome(payload: WelcomePayload): Promise<void> {
  const parsed = welcomePayloadSchema.parse(payload);
  await getEmailQueue().add("welcome", parsed, defaultJobOptions);
}

export async function getQueueCounts(): Promise<{
  email: Record<string, number>;
  dlq: Record<string, number>;
}> {
  const [emailCounts, dlqCounts] = await Promise.all([
    getEmailQueue().getJobCounts("waiting", "active", "delayed", "failed"),
    getEmailDlq().getJobCounts("waiting", "active", "delayed", "failed"),
  ]);
  return { email: emailCounts, dlq: dlqCounts };
}

export async function getRecentDlqEntries(limit = 20): Promise<EmailDlqEntry[]> {
  const jobs = await getEmailDlq().getJobs(["waiting", "active", "delayed", "failed"], 0, limit - 1, true);
  return jobs.map((job) => {
    const data = (job.data ?? {}) as Partial<EmailDlqEntry>;
    return {
      jobName: data.jobName ?? String(job.name),
      maskedEmail: data.maskedEmail ?? "***",
      requestId: data.requestId ?? "unknown",
      jobId: data.jobId ?? String(job.id),
      attemptsMade: data.attemptsMade ?? job.attemptsMade,
      reason: data.reason ?? String(job.failedReason ?? "unknown"),
      failedAt: data.failedAt ?? new Date(job.timestamp).toISOString(),
    };
  });
}
