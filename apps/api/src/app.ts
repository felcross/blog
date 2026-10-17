import { randomUUID } from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./shared/error-middleware.js";
import { logger } from "./shared/logger.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { postsRouter } from "./modules/posts/posts.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";

export function createApp() {
  const app = express();

  // Behind NPM + blog nginx: lets req.ip / secure cookies see the real client
  app.set("trust proxy", env.TRUST_PROXY);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_URL,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Correlation id: accept inbound x-request-id or generate one
  app.use((req, res, next) => {
    const inbound = req.headers["x-request-id"];
    const requestId =
      typeof inbound === "string" && inbound.length > 0 && inbound.length <= 128
        ? inbound
        : randomUUID();
    res.setHeader("x-request-id", requestId);
    req.headers["x-request-id"] = requestId;
    next();
  });

  app.use("/api/health", healthRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export { logger, env };
