import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export async function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  // Auth disabled when no password is configured (e.g. local dev).
  if (!password) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value;
  const expected = await authToken(password);
  if (cookie && cookie === expected) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

// The whole app is private — it shows what someone ate — so everything requires
// the password except the login page, the login route, Next internals and
// static files.
//
// This matcher does NOT cover Server Functions, which are reachable by direct
// POST regardless of path — those check for themselves via requireDashboardAuth.
export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
