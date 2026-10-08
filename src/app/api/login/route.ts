import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

function safeNext(next: string): string {
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  const expected = process.env.DASHBOARD_PASSWORD;

  if (!expected || password !== expected) {
    return NextResponse.redirect(
      new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url),
      { status: 303 },
    );
  }

  const res = NextResponse.redirect(new URL(next, req.url), { status: 303 });
  res.cookies.set(AUTH_COOKIE, await authToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
