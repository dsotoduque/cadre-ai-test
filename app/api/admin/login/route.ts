import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { attemptAdminLogin } from "@/modules/auth/application/attempt-admin-login";
import { ADMIN_SESSION_COOKIE } from "@/modules/auth/application/verify-admin-session";

const requestSchema = z.object({ secret: z.string().min(1) });
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!attemptAdminLogin(parsed.data.secret)) {
    return NextResponse.json({ error: "Incorrect secret" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, parsed.data.secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return response;
}
