import { Router } from "express";
import { prisma } from "../../shared/prisma.js";
import { pingRedis } from "../../queues/connection.js";

export const healthRouter = Router();

/** Liveness: no dependency checks. Used by Docker healthcheck + CI smoke test. */
healthRouter.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

/** Readiness: Postgres + Redis. */
healthRouter.get("/ready", async (_req, res) => {
  const checks: Record<string, "up" | "down"> = {};
  let ok = true;

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "up";
  } catch {
    checks.database = "down";
    ok = false;
  }

  if (await pingRedis()) {
    checks.redis = "up";
  } else {
    checks.redis = "down";
    ok = false;
  }

  res.status(ok ? 200 : 503).json({
    status: ok ? "ok" : "degraded",
    checks,
  });
});
