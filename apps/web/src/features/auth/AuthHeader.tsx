import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { apiSend } from "@/shared/api";
import { strings } from "@/shared/strings";
import { isAdmin, useAuth } from "./useAuth";

export function AuthHeader() {
  const { user, isLoggedIn, clearAuth } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout(): Promise<void> {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await apiSend<void>("/auth/logout", "POST");
    } catch {
      // Logout should clear the local session even if the request fails.
    } finally {
      clearAuth();
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      setIsLoggingOut(false);
      navigate("/", { replace: true });
    }
  }

  return (
    <header className="border-b border-border-light bg-light-bg">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 lg:px-12">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center font-[family-name:var(--font-inter)] text-base font-bold tracking-tight transition-colors hover:text-accent"
        >
          {strings.meta.siteName}
        </Link>
        <nav className="ml-auto flex flex-wrap items-center gap-2" aria-label={strings.meta.siteName}>
          {isAdmin(user) ? (
            <Link
              to="/admin"
              className="inline-flex min-h-11 items-center rounded-full border border-border-light px-5 text-sm font-medium transition-colors hover:border-text-on-light hover:text-accent"
            >
              {strings.auth.adminLink}
            </Link>
          ) : null}
          {isLoggedIn && user ? (
            <>
              <span className="max-w-[14rem] truncate px-2 text-sm text-text-on-light-muted">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
                className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-text-on-dark transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {strings.auth.logout}
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-medium text-text-on-dark transition-opacity hover:opacity-90"
            >
              {strings.auth.login}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
