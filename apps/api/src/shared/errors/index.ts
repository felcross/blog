export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "POST_NOT_FOUND"
  | "NOT_FOUND"
  | "INVALID_TOKEN"
  | "INVALID_STATE_TRANSITION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface ErrorCatalogEntry {
  status: number;
  message: string;
}

export const ERROR_CATALOG: Record<ErrorCode, ErrorCatalogEntry> = {
  VALIDATION_ERROR: { status: 400, message: "Request validation failed" },
  UNAUTHENTICATED: { status: 401, message: "Authentication required" },
  FORBIDDEN: { status: 403, message: "Forbidden" },
  POST_NOT_FOUND: { status: 404, message: "Post not found" },
  NOT_FOUND: { status: 404, message: "Resource not found" },
  INVALID_TOKEN: { status: 401, message: "Invalid or expired token" },
  INVALID_STATE_TRANSITION: {
    status: 409,
    message: "Invalid state transition",
  },
  CONFLICT: { status: 409, message: "Conflict" },
  RATE_LIMITED: { status: 429, message: "Too many requests" },
  SERVICE_UNAVAILABLE: { status: 503, message: "Service unavailable" },
  INTERNAL_ERROR: { status: 500, message: "Internal server error" },
};

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly expose: boolean;

  constructor(code: ErrorCode, message?: string, details?: unknown) {
    const entry = ERROR_CATALOG[code];
    super(message ?? entry.message);
    this.name = "AppError";
    this.code = code;
    this.status = entry.status;
    this.details = details;
    this.expose = code !== "INTERNAL_ERROR";
  }

  toBody(requestId: string): ErrorBody {
    return {
      error: {
        code: this.code,
        message: this.expose ? this.message : ERROR_CATALOG.INTERNAL_ERROR.message,
        requestId,
        ...(this.details !== undefined && this.expose
          ? { details: this.details }
          : {}),
      },
    };
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function isPrismaKnownError(
  err: unknown,
): err is { code: string; meta?: unknown } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code.startsWith("P")
  );
}

/** Map known Prisma error codes to catalog errors. Returns null if unknown. */
export function mapPrismaError(err: unknown): AppError | null {
  if (!isPrismaKnownError(err)) return null;
  switch (err.code) {
    case "P2002":
      return new AppError("CONFLICT", "Resource already exists");
    case "P2025":
      return new AppError("NOT_FOUND", "Resource not found");
    default:
      return null;
  }
}
