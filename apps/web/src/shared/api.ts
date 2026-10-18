export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: unknown,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.requestId !== undefined ? { requestId: this.requestId } : {}),
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

const BASE = "/api";

async function parseErrorBody(res: Response): Promise<ApiErrorBody | null> {
  try {
    const body: unknown = await res.json();
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as ApiErrorBody).error === "object" &&
      (body as ApiErrorBody).error !== null &&
      "code" in (body as ApiErrorBody).error &&
      "message" in (body as ApiErrorBody).error
    ) {
      return body as ApiErrorBody;
    }
    return null;
  } catch {
    return null;
  }
}

const STATUS_FALLBACK_CODE: Record<number, string> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHENTICATED",
  403: "FORBIDDEN",
  404: "POST_NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  503: "SERVICE_UNAVAILABLE",
};

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Network request failed", 0);
  }

  if (!res.ok) {
    const body = await parseErrorBody(res);
    if (body) {
      throw new ApiError(
        body.error.code,
        body.error.message,
        res.status,
        body.error.details,
        body.error.requestId,
      );
    }
    const code = STATUS_FALLBACK_CODE[res.status] ?? "INTERNAL_ERROR";
    throw new ApiError(
      code,
      `Request failed with status ${res.status}`,
      res.status,
      undefined,
      res.headers.get("x-request-id") ?? undefined,
    );
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T>(path, init ?? {});
}

export type MutationMethod = "POST" | "PUT" | "PATCH" | "DELETE";

export function getCsrfToken(): string | null {
  const match = /(?:^|;\s*)csrf_token=([^;]*)/.exec(document.cookie);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export interface ApiSendOptions {
  body?: unknown;
  headers?: Record<string, string>;
}

export async function apiSend<T>(
  path: string,
  method: MutationMethod,
  options?: ApiSendOptions,
): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers };
  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const csrf = getCsrfToken();
  if (csrf) {
    headers["X-CSRF-Token"] = csrf;
  }
  return request<T>(path, {
    method,
    headers,
    ...(options?.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
}
