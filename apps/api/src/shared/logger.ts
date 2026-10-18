import pino from "pino";
import { env } from "../config/env.js";

export type Logger = pino.Logger;

const redactPaths = [
  "req.headers.cookie",
  "req.headers.authorization",
  "req.headers['set-cookie']",
  "res.headers['set-cookie']",
  "headers.cookie",
  "headers.authorization",
  "headers['set-cookie']",
  "token",
  "rawToken",
  "tokenHash",
  "sessionToken",
  "sessionRawToken",
  "password",
  "pass",
  "SMTP_PASS",
  "smtpPass",
  "SESSION_SECRET",
  "sessionSecret",
  "url",
  "link",
  "magicLink",
  "*.token",
  "*.rawToken",
  "*.tokenHash",
  "*.sessionToken",
  "*.password",
  "*.pass",
  "*.SMTP_PASS",
  "*.SESSION_SECRET",
  "*.url",
  "*.link",
];

export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local[0] ?? "*";
  return `${head}***${domain}`;
}

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: {
    paths: redactPaths,
    censor: "[REDACTED]",
  },
});
