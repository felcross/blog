import { isApiError } from "./api";
import { strings } from "./strings";

export function errorStateMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === "NETWORK_ERROR") return strings.errors.networkMessage;
    if (error.code === "RATE_LIMITED") return strings.errors.rateLimitedMessage;
  }
  return strings.errors.genericMessage;
}
