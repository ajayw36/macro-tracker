// Single-password gate. The cookie holds a SHA-256 token derived from the
// password (never the plaintext). Works in both Edge middleware and Node via
// Web Crypto.

export const AUTH_COOKIE = "macros_auth";

export async function authToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`${password}::macros-auth-v1`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
