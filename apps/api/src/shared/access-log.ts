import type { NextFunction, Request, Response } from "express";
import { getLogger } from "./context.js";

function isHealthPath(path: string): boolean {
  const p = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
  return p === "/api/health" || p === "/api/health/ready";
}

/** Never log query string values on auth routes (tokens live there). */
function safeRoutePath(req: Request): string {
  const base = req.originalUrl.split("?")[0] ?? req.path;
  if (base.startsWith("/api/auth/")) return base;
  // Express route.path for get("/") is "/"; baseUrl + path yields "/api/health/"
  const combined =
    req.route?.path !== undefined ? `${req.baseUrl}${req.route.path}` : base;
  return combined.endsWith("/") && combined.length > 1
    ? combined.slice(0, -1)
    : combined;
}

export function accessLog(req: Request, res: Response, next: NextFunction): void {
  const start = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const status = res.statusCode;
    const path = safeRoutePath(req);
    const health = isHealthPath(path);
    // getLogger() already binds requestId and userId — do not duplicate in payload
    const log = getLogger();

    const payload = {
      method: req.method,
      route: path,
      status,
      durationMs: Math.round(durationMs * 100) / 100,
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
