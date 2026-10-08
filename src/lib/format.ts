// Pure formatting helpers, safe to use on client and server.

/** Round to n decimals and return a number (no trailing zeros). */
export function round(n: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

/**
 * Local-time day bucket, "YYYY-MM-DD". Relies on process.env.TZ having been
 * pinned to the user's timezone (db.ts at boot, getSettings() per request), the
 * same contract the bucketing in metrics.ts depends on.
 */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
