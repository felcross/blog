import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiSend, getCsrfToken, isApiError } from "@/shared/api";
import { errorStateMessage } from "@/shared/error";
import { strings } from "@/shared/strings";
import { useAuth } from "./useAuth";
import type { VerifyResponse } from "./types";

export function Verify() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setAuth } = useAuth();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isInvalid, setIsInvalid] = useState(false);

  async function handleConfirm(): Promise<void> {
    if (!token || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setIsInvalid(false);
    try {
      const result = await apiSend<VerifyResponse>("/auth/verify", "POST", { body: { token } });
      setAuth({ user: result.user, csrfToken: getCsrfToken() });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate(result.user.role === "ADMIN" ? "/admin" : "/", { replace: true });
    } catch (error) {
      if (isApiError(error) && (error.code === "UNAUTHORIZED" || error.status === 401)) {
        setIsInvalid(true);
        setErrorMessage(strings.auth.verifyInvalidMessage);
      } else {
        setErrorMessage(errorStateMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const missingToken = !token;

  return (
    <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
      <div className="w-full max-w-md px-6 py-16 text-center">
        <h1 className="mb-3 font-[family-name:var(--font-inter)] text-3xl font-black">
          {strings.auth.verifyTitle}
        </h1>
        <p className="mb-8 text-text-on-light-muted">
          {missingToken ? strings.auth.verifyMissingTokenMessage : strings.auth.verifyMessage}
        </p>

        {errorMessage ? (
          <p role="alert" className="mb-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-text-on-light">
            {errorMessage}
          </p>
        ) : null}

        {!missingToken ? (
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isSubmitting}
            className="w-full rounded-full bg-accent px-6 font-medium text-text-on-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 min-h-11"
          >
            {isSubmitting ? strings.auth.verifyConfirming : strings.auth.verifyConfirm}
          </button>
        ) : null}

        {isInvalid || missingToken ? (
          <Link
            to="/login"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent min-h-11"
          >
            {strings.auth.requestNewLink}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
