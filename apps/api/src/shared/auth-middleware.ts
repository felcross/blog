import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { getSessionUser, type AuthUser } from "../modules/auth/auth.service.js";
import { AppError } from "./errors.js";

export const SESSION_COOKIE_NAME = "session";
export const CSRF_COOKIE_NAME = "csrf_token";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Pre-auth endpoints are reachable before a CSRF cookie exists.
const CSRF_SKIP_PATHS = new Set(["/api/auth/magic-link", "/api/auth/verify"]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function cookieOptions(httpOnly: boolean) {
  return {
    httpOnly,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: THIRTY_DAYS_MS,
  };
}

export function setSessionCookie(res: Response, raw: string): void {
  res.cookie(SESSION_COOKIE_NAME, raw, cookieOptions(true));
}

export function clearSessionCookie(res: Response): void {
  const { maxAge: _maxAge, ...rest } = cookieOptions(true);
  res.clearCookie(SESSION_COOKIE_NAME, rest);
}

export function setCsrfCookie(res: Response): string {
  const token = randomBytes(32).toString("hex");
  res.cookie(CSRF_COOKIE_NAME, token, cookieOptions(false));
  return token;
}

export function clearCsrfCookie(res: Response): void {
  const { maxAge: _maxAge, ...rest } = cookieOptions(false);
  res.clearCookie(CSRF_COOKIE_NAME, rest);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const raw = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof raw !== "string" || raw.length === 0) {
      throw new AppError("UNAUTHORIZED", "Authentication required");
    }
    const user = await getSessionUser(raw);
    if (!user) {
      throw new AppError("UNAUTHORIZED", "Invalid or expired session");
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError("UNAUTHORIZED", "Authentication required"));
    return;
  }
  if (req.user.role !== "ADMIN") {
    next(new AppError("FORBIDDEN", "Admin access required"));
    return;
  }
  next();
}

export function csrfProtection(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!UNSAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const path = req.originalUrl.split("?")[0];
  if (CSRF_SKIP_PATHS.has(path)) {
    next();
    return;
  }

  const header = req.get("X-CSRF-Token");
  if (typeof header !== "string" || header.length === 0) {
    next(new AppError("FORBIDDEN", "Missing CSRF token"));
    return;
  }

  // Double-submit: when the cookie is present it must match the header.
  // When absent (e.g. cookie expired) the custom header alone still blocks
  // simple cross-site form/forged requests.
  const cookie = req.cookies?.[CSRF_COOKIE_NAME];
  if (typeof cookie === "string" && cookie.length > 0 && !safeEqual(cookie, header)) {
    next(new AppError("FORBIDDEN", "CSRF token mismatch"));
    return;
  }

  next();
}
