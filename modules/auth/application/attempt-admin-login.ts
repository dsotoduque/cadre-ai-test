import { env } from "@/lib/env";

export function attemptAdminLogin(secret: string): boolean {
  return secret === env.adminSecret;
}
