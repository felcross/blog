import { AsyncLocalStorage } from "node:async_hooks";
import { logger, type Logger } from "./logger.js";

export interface RequestContext {
  requestId: string;
  userId?: string;
  jobId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run({ ...ctx }, fn);
}

/** Enter a context for the rest of the current async execution (Express middleware). */
export function enterWithContext(ctx: RequestContext): void {
  storage.enterWith({ ...ctx });
}

export function getContext(): RequestContext | undefined {
  return storage.getStore();
}

export function setContextUserId(userId: string): void {
  const ctx = storage.getStore();
  if (ctx) ctx.userId = userId;
}

/** Child logger bound to the current request context (requestId, userId, jobId). */
export function getLogger(): Logger {
  const ctx = storage.getStore();
  if (ctx?.requestId) {
    return logger.child({
      requestId: ctx.requestId,
      userId: ctx.userId,
      jobId: ctx.jobId,
    });
  }
  return logger;
}
