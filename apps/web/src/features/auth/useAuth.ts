import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, getCsrfToken } from "@/shared/api";
import type { AuthUser, MeResponse } from "./types";

export interface AuthSession {
  user: AuthUser | null;
  isLoggedIn: boolean;
  csrfToken: string | null;
  isLoading: boolean;
  setAuth: (next: { user: AuthUser; csrfToken?: string | null }) => void;
  clearAuth: () => void;
}

const AuthContext = createContext<AuthSession | null>(null);

interface SessionState {
  user: AuthUser | null;
  csrfToken: string | null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionState>({
    user: null,
    csrfToken: null,
  });

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () => apiGet<MeResponse>("/auth/me"),
    retry: false,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (meQuery.data) {
      setSession({ user: meQuery.data.user, csrfToken: meQuery.data.csrfToken });
    }
  }, [meQuery.data]);

  const setAuth = useCallback(
    (next: { user: AuthUser; csrfToken?: string | null }) => {
      const csrfToken = next.csrfToken !== undefined ? next.csrfToken : getCsrfToken();
      setSession({ user: next.user, csrfToken });
      queryClient.setQueryData<MeResponse>(["me"], {
        user: next.user,
        csrfToken: csrfToken ?? "",
      });
    },
    [queryClient],
  );

  const clearAuth = useCallback(() => {
    setSession({ user: null, csrfToken: null });
    queryClient.setQueryData(["me"], null);
  }, [queryClient]);

  const value = useMemo<AuthSession>(
    () => ({
      user: session.user,
      isLoggedIn: session.user !== null,
      csrfToken: session.csrfToken,
      isLoading: meQuery.isPending,
      setAuth,
      clearAuth,
    }),
    [session, meQuery.isPending, setAuth, clearAuth],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthSession {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "ADMIN";
}
