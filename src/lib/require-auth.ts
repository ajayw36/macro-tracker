// Server-side auth guard for Server Functions and Route Handlers.
//
// src/proxy.ts gates page and API routes, but Server Functions are not matched
// by it at all — they are reachable by direct POST regardless of which page
// renders the form. Anything that mutates data or spends an API quota therefore
// has to check for itself. Mirrors the proxy's semantics exactly: with no
// DASHBOARD_PASSWORD configured the gate is disabled (local dev).

import { cookies } from "next/headers";
import { AUTH_COOKIE, authToken } from "@/lib/auth";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export async function isAuthorized(): Promise<boolean> {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return true; // auth disabled, same as proxy.ts
  const jar = await cookies(); // async in Next 16 — sync access was removed
  return jar.get(AUTH_COOKIE)?.value === (await authToken(password));
}

export async function requireDashboardAuth(): Promise<void> {
  if (!(await isAuthorized())) throw new UnauthorizedError();
}
