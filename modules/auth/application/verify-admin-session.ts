import { env } from "@/lib/env";

export const ADMIN_SESSION_COOKIE = "admin_session";

export function verifyAdminSession(cookieValue: string | undefined): boolean {
  return !!cookieValue && cookieValue === env.adminSecret;
}
