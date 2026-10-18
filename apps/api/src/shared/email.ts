import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { getContext, getLogger } from "./context.js";
import { maskEmail } from "./logger.js";
import { enqueueMagicLink, enqueueWelcome } from "../queues/email.queue.js";

export interface SendMagicLinkOptions {
  /** LoginToken.id — used as idempotent BullMQ jobId (magic-link:<id>). */
  loginTokenId?: string;
}

export interface EmailService {
  sendMagicLink(
    email: string,
    link: string,
    options?: SendMagicLinkOptions,
  ): Promise<void>;
  sendWelcome(email: string, name?: string): Promise<void>;
}

export class NodemailerEmailService implements EmailService {
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth:
        env.SMTP_USER && env.SMTP_PASS
          ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
          : undefined,
    });
  }

  async sendMagicLink(
    email: string,
    link: string,
    _options?: SendMagicLinkOptions,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: "Your sign-in link",
      text: `Use this link to sign in (valid for 15 minutes):\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this link to sign in (valid for 15 minutes):</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }

  async sendWelcome(email: string, name?: string): Promise<void> {
    const greeting = name ? `Hi ${name},` : "Hi,";
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: "Welcome",
      text: `${greeting}\n\nWelcome! Your account is ready. You can sign in with a magic link whenever you like.`,
      html: `<p>${greeting}</p><p>Welcome! Your account is ready. You can sign in with a magic link whenever you like.</p>`,
    });
  }
}

/**
 * Producer-side implementation: only enqueues jobs. The worker process
 * talks to SMTP. Keeps the API request fast and resilient.
 */
export class QueueEmailService implements EmailService {
  async sendMagicLink(
    email: string,
    link: string,
    options?: SendMagicLinkOptions,
  ): Promise<void> {
    const requestId = getContext()?.requestId ?? "unknown";
    const loginTokenId = options?.loginTokenId;
    if (!loginTokenId) {
      // Without a loginTokenId we cannot guarantee idempotency.
      throw new Error("loginTokenId is required to enqueue a magic-link email");
    }
    await enqueueMagicLink({ email, url: link, requestId }, loginTokenId);
  }

  async sendWelcome(email: string, name?: string): Promise<void> {
    const requestId = getContext()?.requestId ?? "unknown";
    await enqueueWelcome({ email, name, requestId });
  }
}

export interface SentEmail {
  to: string;
  link?: string;
  kind: "magic-link" | "welcome";
}

export class FakeEmailService implements EmailService {
  readonly sent: SentEmail[] = [];

  async sendMagicLink(
    email: string,
    link: string,
    _options?: SendMagicLinkOptions,
  ): Promise<void> {
    this.sent.push({ to: email, link, kind: "magic-link" });
  }

  async sendWelcome(email: string, _name?: string): Promise<void> {
    this.sent.push({ to: email, kind: "welcome" });
  }
}

let cached: EmailService | undefined;

export function createEmailService(): EmailService {
  if (!cached) {
    cached =
      env.NODE_ENV === "test"
        ? new FakeEmailService()
        : new QueueEmailService();
  }
  return cached;
}

/** Transport used by the worker process (actual SMTP). */
export function createSmtpEmailService(): EmailService {
  return new NodemailerEmailService();
}

export function logEmailQueued(
  kind: "magic-link" | "welcome",
  email: string,
): void {
  getLogger().info({ kind, email: maskEmail(email) }, "email enqueued");
}
