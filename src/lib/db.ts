import { PrismaClient } from "@prisma/client";

// Pin the process timezone so all day bucketing (dayKey() in format.ts and the
// 30-day series in metrics.ts use local-time getters like getDate()/getMonth())
// matches the user's wall clock instead of the host's. Vercel Functions run
// with TZ=UTC, which would push a late dinner (e.g. 9pm ET = 01:00 UTC the next
// day) onto the wrong calendar day. Set unconditionally (Vercel already sets
// TZ=UTC, so a "don't clobber" guard would never fire); override via APP_TZ if
// needed. Runs at module load, before any Date logic. This is only the
// boot-time fallback: the user-facing "timezone" setting (Setting table) repins
// TZ in getSettings(), which runs before any bucketing.
process.env.TZ = process.env.APP_TZ ?? "America/New_York";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
