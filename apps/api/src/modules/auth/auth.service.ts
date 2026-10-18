import { createHash, randomBytes } from "node:crypto";
import type { User } from "@prisma/client";
import { env } from "../../config/env.js";
import { getLogger } from "../../shared/context.js";
import { maskEmail } from "../../shared/logger.js";
import type { EmailService } from "../../shared/email.js";
import { AppError } from "../../shared/errors/index.js";
import { prisma } from "../../shared/prisma.js";

const LOGIN_TOKEN_TTL_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "USER";
}

function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAdminEmail(email: string): boolean {
  return email === normalizeEmail(env.ADMIN_EMAIL);
}

export async function requestMagicLink(
  email: string,
  emailService: EmailService,
): Promise<{ rawToken: string }> {
  const normalized = normalizeEmail(email);
  const rawToken = generateRawToken();

  // Only the newest magic link is valid: drop any previous unconsumed tokens.
  // Capture the created LoginToken id so the queue can use it as jobId.
  const [, loginToken] = await prisma.$transaction([
    prisma.loginToken.deleteMany({
      where: { email: normalized, usedAt: null },
    }),
    prisma.loginToken.create({
      data: {
        email: normalized,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
      },
    }),
  ]);

  const link = `${env.WEB_URL}/verify?token=${rawToken}`;
  await emailService.sendMagicLink(normalized, link, {
    loginTokenId: loginToken.id,
  });

  return { rawToken };
}

export async function verifyToken(
  rawToken: string,
): Promise<{ user: AuthUser; sessionRawToken: string; created: boolean }> {
  const tokenHash = hashToken(rawToken);

  return prisma.$transaction(async (tx) => {
    const loginToken = await tx.loginToken.findUnique({ where: { tokenHash } });
    if (
      !loginToken ||
      loginToken.usedAt !== null ||
      loginToken.expiresAt.getTime() < Date.now()
    ) {
      throw new AppError("INVALID_TOKEN");
    }

    await tx.loginToken.update({
      where: { id: loginToken.id },
      data: { usedAt: new Date() },
    });

    const email = loginToken.email;
    const admin = isAdminEmail(email);

    const existing = await tx.user.findUnique({ where: { email } });
    let user: User;
    let created = false;
    if (existing) {
      user = await tx.user.update({
        where: { email },
        data: admin ? { role: "ADMIN" } : {},
      });
    } else {
      user = await tx.user.create({
        data: { email, role: admin ? "ADMIN" : "USER" },
      });
      created = true;
    }

    const sessionRawToken = generateRawToken();
    await tx.session.create({
      data: {
        tokenHash: hashToken(sessionRawToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });

    return { user: toAuthUser(user), sessionRawToken, created };
  });
}

/** Enqueue welcome email only when verify created the user. Never fails login. */
export async function maybeSendWelcome(
  emailService: EmailService,
  user: AuthUser,
  created: boolean,
): Promise<void> {
  if (!created) return;
  try {
    await emailService.sendWelcome(user.email, user.name ?? undefined);
    getLogger().info(
      { userId: user.id, email: maskEmail(user.email) },
      "welcome email enqueued",
    );
  } catch (err) {
    getLogger().error(
      { err, userId: user.id, email: maskEmail(user.email) },
      "failed to enqueue welcome email",
    );
  }
}

export async function getSessionUser(
  sessionRawToken: string,
): Promise<AuthUser | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(sessionRawToken) },
    include: { user: true },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  return toAuthUser(session.user);
}

export async function destroySession(sessionRawToken: string): Promise<void> {
  await prisma.session.deleteMany({
    where: { tokenHash: hashToken(sessionRawToken) },
  });
}
