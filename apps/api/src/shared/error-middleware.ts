import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { getContext, getLogger } from "./context.js";
import {
  AppError,
  isAppError,
  mapPrismaError,
  type ErrorBody,
} from "./errors/index.js";

function resolveRequestId(req: Request): string {
  const fromHeader = req.headers["x-request-id"];
  if (typeof fromHeader === "string" && fromHeader.length > 0) return fromHeader;
  return getContext()?.requestId ?? "unknown";
}

export function notFoundHandler(req: Request, res: Response): void {
  const requestId = resolveRequestId(req);
  const body: ErrorBody = {
    error: {
      code: "NOT_FOUND",
      message: "Resource not found",
      requestId,
    },
  };
  res.status(404).json(body);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = resolveRequestId(req);
  const log = getLogger();

  if (err instanceof ZodError) {
    const appErr = new AppError("VALIDATION_ERROR", "Request validation failed", {
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    log.warn({ code: appErr.code, details: appErr.details }, "validation error");
    res.status(appErr.status).json(appErr.toBody(requestId));
    return;
  }

  const prismaErr = mapPrismaError(err);
  if (prismaErr) {
    log.warn({ code: prismaErr.code, message: prismaErr.message }, "prisma error");
    res.status(prismaErr.status).json(prismaErr.toBody(requestId));
    return;
  }

  if (isAppError(err)) {
    log.warn({ code: err.code, message: err.message }, "request failed");
    res.status(err.status).json(err.toBody(requestId));
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  log.error({ err: error }, "unhandled error");
  const appErr = new AppError("INTERNAL_ERROR");
  res.status(appErr.status).json(appErr.toBody(requestId));
}
