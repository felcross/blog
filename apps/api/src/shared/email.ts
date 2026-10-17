import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export interface EmailService {
  sendMagicLink(email: string, link: string): Promise<void>;
}

export class NodemailerEmailService implements EmailService {
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER && env.SMTP_PASS
        ? { user: env.SMTP_USER, pass: env.SMTP_PASS }
        : undefined,
    });
  }

  async sendMagicLink(email: string, link: string): Promise<void> {
    await this.transporter.sendMail({
      from: env.SMTP_FROM,
      to: email,
      subject: "Your sign-in link",
      text: `Use this link to sign in (valid for 15 minutes):\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
      html: `<p>Use this link to sign in (valid for 15 minutes):</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can ignore this email.</p>`,
    });
  }
}

export interface SentEmail {
  to: string;
  link: string;
}

export class FakeEmailService implements EmailService {
  readonly sent: SentEmail[] = [];

  async sendMagicLink(email: string, link: string): Promise<void> {
    this.sent.push({ to: email, link });
  }
}

let cached: EmailService | undefined;

export function createEmailService(): EmailService {
  if (!cached) {
    cached =
      env.NODE_ENV === "test"
        ? new FakeEmailService()
        : new NodemailerEmailService();
  }
  return cached;
}
