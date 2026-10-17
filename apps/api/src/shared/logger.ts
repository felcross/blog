import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  transport:
    env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      "token",
      "tokenHash",
      "sessionToken",
      "password",
    ],
    censor: "[REDACTED]",
  },
});
