import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./shared/logger.js";
import { prisma } from "./shared/prisma.js";

async function main() {
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info(`API listening on :${env.PORT}`);
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "failed to start server");
  process.exit(1);
});
