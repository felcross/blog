import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  clearCsrfCookie,
  clearSessionCookie,
  csrfProtection,
  requireAuth,
  setCsrfCookie,
  setSessionCookie,
} from "../../shared/auth-middleware.js";
import { createEmailService } from "../../shared/email.js";
import { AppError } from "../../shared/errors.js";
import { destroySession, requestMagicLink, verifyToken } from "./auth.service.js";

const emailService = createEmailService();

const magicLinkBodySchema = z.object({
  email: z.string().email(),
});

const verifyBodySchema = z.object({
  token: z.string().min(1),
});

const magicLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === "string"
        ? body.email.trim().toLowerCase()
        : "unknown";
    return `${req.ip ?? "unknown"}:${email}`;
  },
  handler: (_req, res, _next, _optionsUsed) => {
    const err = new AppError(
      "RATE_LIMITED",
      "Too many requests, please try again later",
    );
    res.status(err.status).json(err.toBody());
  },
});

export const authRouter = Router();

authRouter.post("/magic-link", magicLinkLimiter, async (req, res, next) => {
  try {
    const { email } = magicLinkBodySchema.parse(req.body);
    await requestMagicLink(email, emailService);
    res.status(202).json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify", async (req, res, next) => {
  try {
    const { token } = verifyBodySchema.parse(req.body);
    const { user, sessionRawToken } = await verifyToken(token);
    setSessionCookie(res, sessionRawToken);
    setCsrfCookie(res);
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", csrfProtection, async (req, res, next) => {
  try {
    const raw = req.cookies?.session;
    if (typeof raw === "string" && raw.length > 0) {
      await destroySession(raw);
    }
    clearSessionCookie(res);
    clearCsrfCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  const existing = req.cookies?.csrf_token;
  const csrfToken =
    typeof existing === "string" && existing.length > 0
      ? existing
      : setCsrfCookie(res);
  res.status(200).json({ user: req.user, csrfToken });
});
