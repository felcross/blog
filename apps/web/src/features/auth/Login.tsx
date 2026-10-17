import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiSend, isApiError } from "@/shared/api";
import { errorStateMessage } from "@/shared/error";
import { strings } from "@/shared/strings";
import type { MagicLinkResponse } from "./types";

type LoginView = "form" | "inbox";

export function Login() {
  const [view, setView] = useState<LoginView>("form");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function sendMagicLink(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await apiSend<MagicLinkResponse>("/auth/magic-link", "POST", {
        body: { email: email.trim() },
      });
      setView("inbox");
    } catch (error) {
      if (isApiError(error) && error.code === "RATE_LIMITED") {
        setErrorMessage(strings.errors.rateLimitedMessage);
      } else {
        setErrorMessage(errorStateMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend(): Promise<void> {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await apiSend<MagicLinkResponse>("/auth/magic-link", "POST", {
        body: { email: email.trim() },
      });
    } catch (error) {
      if (isApiError(error) && error.code === "RATE_LIMITED") {
        setErrorMessage(strings.errors.rateLimitedMessage);
      } else {
        setErrorMessage(errorStateMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-light-bg text-text-on-light">
      <div className="w-full max-w-md px-6 py-16">
        {view === "form" ? (
          <>
            <h1 className="mb-3 font-[family-name:var(--font-inter)] text-3xl font-black">
              {strings.auth.loginTitle}
            </h1>
            <p className="mb-8 text-text-on-light-muted">{strings.auth.loginSubtitle}</p>

            {errorMessage ? (
              <p role="alert" className="mb-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-text-on-light">
                {errorMessage}
              </p>
            ) : null}

            <form onSubmit={(event) => void sendMagicLink(event)} noValidate>
              <label htmlFor="login-email" className="mb-2 block text-sm font-medium">
                {strings.auth.emailLabel}
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={strings.auth.emailPlaceholder}
                className="mb-6 w-full rounded-xl border border-border-light bg-light-bg px-4 text-base outline-none transition-colors focus:border-accent min-h-11"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-full bg-accent px-6 font-medium text-text-on-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 min-h-11"
              >
                {isSubmitting ? strings.auth.submitting : strings.auth.submit}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mb-3 font-[family-name:var(--font-inter)] text-3xl font-black">
              {strings.auth.checkInboxTitle}
            </h1>
            <p className="mb-8 text-text-on-light-muted">{strings.auth.checkInboxMessage}</p>

            {errorMessage ? (
              <p role="alert" className="mb-6 rounded-xl border border-accent/40 bg-accent/10 p-4 text-sm text-text-on-light">
                {errorMessage}
              </p>
            ) : null}

            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void handleResend()}
                disabled={isSubmitting}
                className="rounded-full border border-border-light px-6 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 min-h-11"
              >
                {isSubmitting ? strings.auth.submitting : strings.auth.resend}
              </button>
              <Link
                to="/login"
                onClick={() => {
                  setView("form");
                  setErrorMessage(null);
                }}
                className="inline-flex items-center justify-center rounded-full px-6 text-sm text-text-on-light-muted transition-colors hover:text-accent min-h-11"
              >
                {strings.auth.backToLogin}
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
