import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { getLogger } from "./shared/context.js";
import { logger } from "./shared/logger.js";
import { prisma } from "./shared/prisma.js";

let shuttingDown = false;

async function gracefulShutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const log = getLogger();
  log.fatal({ reason }, "fatal shutdown");

  try {
    if (server) {
      const s = server;
      await new Promise<void>((resolve) => {
        s.close(() => resolve());
        // Force-close keep-alive sockets after a short drain window
        setTimeout(() => resolve(), 5000).unref();
      });
    }
    await prisma.$disconnect();
  } catch (err) {
    logger.error({ err }, "error during shutdown");
  }
  process.exit(exitCode);
}

let server: import("node:http").Server | undefined;

async function main() {
  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(`API listening on :${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await gracefulShutdown(signal, 0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    void gracefulShutdown("unhandledRejection", 1);
    logger.error({ err }, "unhandledRejection");
  });

  process.on("uncaughtException", (err) => {
    void gracefulShutdown("uncaughtException", 1);
    logger.error({ err }, "uncaughtException");
  });
}

main().catch((err) => {
  logger.error({ err }, "failed to start server");
  process.exit(1);
});
