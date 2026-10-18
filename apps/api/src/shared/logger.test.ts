import { beforeAll, describe, expect, it } from "vitest";

process.env.DATABASE_URL ??= "postgresql://blog:blog@localhost:5433/blog";
process.env.ADMIN_EMAIL ??= "admin@example.com";
process.env.WEB_URL ??= "http://localhost:5173";
process.env.SESSION_SECRET ??= "test-secret-at-least-16-chars";
process.env.SMTP_HOST ??= "localhost";
process.env.SMTP_PORT ??= "1025";
process.env.SMTP_FROM ??= "Blog <noreply@blog.local>";
process.env.NODE_ENV = "test";

let maskEmail: (email: string) => string;
let AppError: typeof import("./errors/index.js").AppError;
let ERROR_CATALOG: typeof import("./errors/index.js").ERROR_CATALOG;
let mapPrismaError: typeof import("./errors/index.js").mapPrismaError;
let getLogger: typeof import("./context.js").getLogger;
let runWithContext: typeof import("./context.js").runWithContext;

beforeAll(async () => {
  const loggerMod = await import("./logger.js");
  const errorsMod = await import("./errors/index.js");
  const contextMod = await import("./context.js");
  maskEmail = loggerMod.maskEmail;
  AppError = errorsMod.AppError;
  ERROR_CATALOG = errorsMod.ERROR_CATALOG;
  mapPrismaError = errorsMod.mapPrismaError;
  getLogger = contextMod.getLogger;
  runWithContext = contextMod.runWithContext;
});

describe("maskEmail", () => {
  it("masks local part keeping first char and domain", () => {
    expect(maskEmail("john@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("feljava32@gmail.com")).toBe("f***@gmail.com");
    expect(maskEmail("a@b.co")).toBe("a***@b.co");
  });

  it("returns *** for invalid emails", () => {
    expect(maskEmail("nope")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
    expect(maskEmail("")).toBe("***");
  });
});

describe("error catalog", () => {
  it("maps every code to an HTTP status and default message", () => {
    for (const [code, entry] of Object.entries(ERROR_CATALOG)) {
      expect(entry.status).toBeGreaterThanOrEqual(400);
      expect(entry.message.length).toBeGreaterThan(0);
      const err = new AppError(code as keyof typeof ERROR_CATALOG);
      expect(err.status).toBe(entry.status);
      expect(err.code).toBe(code);
    }
  });

  it("includes requestId and never exposes INTERNAL_ERROR message", () => {
    const err = new AppError("INTERNAL_ERROR", "secret db password");
    const body = err.toBody("req-123");
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.requestId).toBe("req-123");
    expect(body.error.message).not.toContain("secret");
    expect(body.error.message).toBe("Internal server error");
  });

  it("exposes message and requestId for known codes", () => {
    const err = new AppError("POST_NOT_FOUND");
    const body = err.toBody("abc");
    expect(body.error).toEqual({
      code: "POST_NOT_FOUND",
      message: "Post not found",
      requestId: "abc",
    });
  });
});

describe("mapPrismaError", () => {
  it("maps P2002 to CONFLICT", () => {
    const mapped = mapPrismaError({ code: "P2002", meta: {} });
    expect(mapped?.code).toBe("CONFLICT");
    expect(mapped?.status).toBe(409);
  });

  it("maps P2025 to NOT_FOUND", () => {
    const mapped = mapPrismaError({ code: "P2025" });
    expect(mapped?.code).toBe("NOT_FOUND");
    expect(mapped?.status).toBe(404);
  });

  it("returns null for unknown prisma codes", () => {
    expect(mapPrismaError({ code: "P9999" })).toBeNull();
    expect(mapPrismaError(new Error("nope"))).toBeNull();
  });
});

describe("context propagation", () => {
  it("getLogger() carries requestId from runWithContext", () => {
    runWithContext({ requestId: "ctx-1", userId: "u-1" }, () => {
      const log = getLogger();
      expect(log.bindings()).toMatchObject({ requestId: "ctx-1", userId: "u-1" });
    });
  });

  it("getLogger() without context returns root logger", () => {
    const log = getLogger();
    expect(log.bindings().requestId).toBeUndefined();
  });
});

describe("redaction", () => {
  it("redacts cookies, tokens, Authorization, SMTP_PASS, and URLs", async () => {
    const pino = (await import("pino")).default;
    const chunks: string[] = [];
    const dest = {
      write(s: string) {
        chunks.push(s);
      },
    };
    const log = pino(
      {
        level: "info",
        redact: {
          paths: [
            "req.headers.cookie",
            "req.headers.authorization",
            "headers['set-cookie']",
            "token",
            "tokenHash",
            "sessionToken",
            "password",
            "pass",
            "SMTP_PASS",
            "SESSION_SECRET",
            "url",
            "link",
            "*.token",
            "*.url",
            "*.link",
            "*.tokenHash",
          ],
          censor: "[REDACTED]",
        },
      },
      dest,
    );

    log.info(
      {
        req: {
          headers: {
            cookie: "session=super-secret-session",
            authorization: "Bearer abc.def.ghi",
          },
        },
        headers: { "set-cookie": "session=super-secret-session" },
        token: "raw-magic-link-token",
        tokenHash: "sha256hash",
        sessionToken: "sess-token",
        password: "hunter2",
        pass: "hunter2",
        SMTP_PASS: "app-password",
        SESSION_SECRET: "super-session-secret",
        url: "https://blog.felbatista.tech/verify?token=raw-magic-link-token",
        link: "https://blog.felbatista.tech/verify?token=raw-magic-link-token",
        nested: { token: "nested-token", url: "https://x/verify?token=t" },
        email: maskEmail("john@gmail.com"),
      },
      "test line",
    );

    const out = chunks.join("");
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("super-secret-session");
    expect(out).not.toContain("abc.def.ghi");
    expect(out).not.toContain("raw-magic-link-token");
    expect(out).not.toContain("sha256hash");
    expect(out).not.toContain("sess-token");
    expect(out).not.toContain("hunter2");
    expect(out).not.toContain("app-password");
    expect(out).not.toContain("super-session-secret");
    expect(out).not.toContain("nested-token");
    expect(out).toContain("j***@gmail.com");
    expect(out).not.toContain("john@gmail.com");
  });
});
