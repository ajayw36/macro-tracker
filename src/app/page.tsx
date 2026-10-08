import Link from "next/link";
import { MealLogger } from "@/components/MealLogger";
import { MealList, type MealRow } from "@/components/MealList";
import { RecentMeals, type RecentMeal } from "@/components/RecentMeals";
import { NutritionToday } from "@/components/NutritionToday";
import { DailyCalories } from "@/components/DailyCalories";
import { Card, SectionLabel } from "@/components/ui";
import { getNutritionData, type NutritionData } from "@/lib/metrics";
import { getSettings, type AppSettings } from "@/lib/settings";
import { prisma } from "@/lib/db";
import { dayKey } from "@/lib/format";
import type { MealItem } from "@/lib/nutrition";

export const dynamic = "force-dynamic";

/** "YYYY-MM-DD" -> local Date at noon (noon avoids DST edge cases on ±1 day). */
function keyToDate(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function shiftKey(key: string, days: number): string {
  const d = keyToDate(key)!;
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

function itemNames(items: unknown): string {
  return (Array.isArray(items) ? (items as unknown as MealItem[]) : [])
    .map((i) => i?.name)
    .filter(Boolean)
    .join(", ");
}

interface PageData {
  settings: AppSettings;
  data: NutritionData;
  viewKey: string;
  isToday: boolean;
  rows: MealRow[];
  recent: RecentMeal[];
}

async function load(sp: { day?: string }): Promise<PageData> {
  // Repins process.env.TZ to the user's timezone before any bucketing below.
  const settings = await getSettings();
  const now = new Date();
  const todayKey = dayKey(now);

  // Any unparseable ?day= falls back to today rather than erroring.
  const requested = sp.day && keyToDate(sp.day) ? sp.day : todayKey;
  // Never navigate into the future — there's nothing to log there.
  const viewKey = requested > todayKey ? todayKey : requested;
  const isToday = viewKey === todayKey;

  const [data, meals, recentRows] = await Promise.all([
    getNutritionData(viewKey, now),
    prisma.meal.findMany({ where: { dayKey: viewKey }, orderBy: { eatenAt: "asc" } }),
    // Pull a window and dedupe by name in JS, matching how the rest of the app
    // aggregates. Mongo has no cheap distinct-on-with-payload.
    prisma.meal.findMany({ orderBy: { eatenAt: "desc" }, take: 60 }),
  ]);

  const rows: MealRow[] = meals.map((m) => ({
    id: m.id,
    name: m.name,
    timeLabel: m.eatenAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    itemSummary: itemNames(m.items),
    calories: m.calories,
    proteinG: m.proteinG,
    carbsG: m.carbsG,
    fatG: m.fatG,
  }));

  const seen = new Set<string>();
  const recent: RecentMeal[] = [];
  for (const m of recentRows) {
    const k = m.name.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    recent.push({
      id: m.id,
      name: m.name,
      itemSummary: itemNames(m.items),
      calories: m.calories,
      proteinG: m.proteinG,
      carbsG: m.carbsG,
      fatG: m.fatG,
    });
    if (recent.length === 8) break;
  }

  return { settings, data, viewKey, isToday, rows, recent };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const sp = await searchParams;

  let page: PageData | null = null;
  let error: string | null = null;
  try {
    page = await load(sp);
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load data";
  }

  if (error || !page) {
    return <Onboarding error={error} />;
  }

  const { settings, data, viewKey, isToday, rows, recent } = page;

  const viewDate = keyToDate(viewKey)!;
  const dayLabel = isToday
    ? "Today"
    : viewDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const headerDate = viewDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const navLink = "rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1 text-xs font-semibold text-text transition hover:border-lime/50 hover:text-lime";

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-8">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-text">MACROS</h1>
          <p className="mt-1 text-sm text-muted">{headerDate}</p>
        </div>
        <Link href="/settings" className="text-xs text-muted transition hover:text-lime">
          Settings
        </Link>
      </header>

      <nav className="mt-5 flex items-center justify-between">
        <Link href={`/?day=${shiftKey(viewKey, -1)}`} className={navLink}>
          ← Previous day
        </Link>
        <div className="flex items-center gap-2">
          {!isToday && (
            <Link href="/" className={navLink}>
              Today
            </Link>
          )}
          <Link
            href={isToday ? "/" : `/?day=${shiftKey(viewKey, 1)}`}
            aria-disabled={isToday}
            className={`${navLink} ${isToday ? "pointer-events-none opacity-30" : ""}`}
          >
            Next day →
          </Link>
        </div>
      </nav>

      {settings.calorieTarget == null && (
        <p className="mt-4 text-xs text-faint">
          No daily targets set.{" "}
          <Link href="/settings" className="text-lime underline">
            Set them in Settings
          </Link>{" "}
          to track progress against a goal.
        </p>
      )}

      {/* day totals + 30-day chart */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NutritionToday data={data} dayLabel={dayLabel} />
        <Card className="flex flex-col justify-center">
          <DailyCalories data={data} />
        </Card>
      </div>

      <div className="mt-4 space-y-4">
        <MealLogger dayKey={viewKey} isToday={isToday} />
        {recent.length > 0 && <RecentMeals meals={recent} dayKey={viewKey} isToday={isToday} />}
        <MealList meals={rows} dayLabel={dayLabel} />
      </div>

      <footer className="mt-8 text-center text-[11px] text-faint">
        Estimates by Claude · review before saving
      </footer>
    </main>
  );
}

function Onboarding({ error }: { error: string | null }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-5 py-16">
      <h1 className="text-3xl font-extrabold tracking-tight">MACROS</h1>
      <p className="mt-2 text-muted">Log meals by photo or description — Claude estimates the macros.</p>
      <Card className="mt-6">
        <SectionLabel>Setup needed</SectionLabel>
        <p className="mt-3 text-sm text-muted">
          The app couldn&apos;t reach the database. Set{" "}
          <code className="text-lime">DATABASE_URL</code> in your environment, run{" "}
          <code className="text-lime">npm run db:push</code>, then reload.
        </p>
        {error && (
          <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-bg-elevated p-3 text-[11px] text-faint">
            {error}
          </pre>
        )}
      </Card>
    </main>
  );
}
