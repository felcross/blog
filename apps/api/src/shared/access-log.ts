import type { NextFunction, Request, Response } from "express";
import { getContext } from "./context.js";
import { getLogger } from "./context.js";

function isHealthPath(path: string): boolean {
  return path === "/api/health" || path === "/api/health/ready";
}

/** Never log query string values on auth routes (tokens live there). */
function safeRoutePath(req: Request): string {
  const base = req.originalUrl.split("?")[0] ?? req.path;
  if (base.startsWith("/api/auth/")) return base;
  return req.route?.path ? `${req.baseUrl}${req.route.path}` : base;
}

export function accessLog(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const path = safeRoutePath(req);
    const health = isHealthPath(path);
    const ctx = getContext();
    const log = getLogger();

    const payload = {
      method: req.method,
      route: path,
      status,
      durationMs: Math.round(durationMs * 100) / 100,
      requestId: ctx?.requestId,
      userId: ctx?.userId ?? req.user?.id,
    };

    if (health) {
      log.debug(payload, "request");
    } else if (status >= 500) {
      log.error(payload, "request");
    } else if (status >= 400) {
      log.warn(payload, "request");
    } else {
      log.info(payload, "request");
    }
  });

  next();
}
