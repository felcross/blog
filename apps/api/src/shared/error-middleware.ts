import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError, isAppError, type ErrorBody } from "./errors.js";
import { logger } from "./logger.js";

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ErrorBody = {
    error: { code: "NOT_FOUND", message: "Resource not found" },
  };
  res.status(404).json(body);
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = req.headers["x-request-id"] ?? "unknown";

  if (err instanceof ZodError) {
    const appErr = new AppError("VALIDATION_ERROR", "Request validation failed", {
      issues: err.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
    logger.warn({ requestId, code: appErr.code, details: appErr.details }, "validation error");
    res.status(appErr.status).json(appErr.toBody());
    return;
  }

  if (isAppError(err)) {
    logger.warn(
      { requestId, code: err.code, message: err.message },
      "request failed",
    );
    res.status(err.status).json(err.toBody());
    return;
  }

  const error = err instanceof Error ? err : new Error(String(err));
  logger.error({ requestId, err: error }, "unhandled error");
  const body: ErrorBody = {
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  };
  res.status(500).json(body);
}
