export type UserRole = "ADMIN" | "USER";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
}

export interface MeResponse {
  user: AuthUser;
  csrfToken: string;
}

export interface MagicLinkResponse {
  ok: true;
}

export interface VerifyResponse {
  user: AuthUser;
}
