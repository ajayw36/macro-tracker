// Derive the nutrition view-data from stored rows. Server-only (uses Prisma).

import { prisma } from "@/lib/db";
import { getSettings, type AppSettings } from "@/lib/settings";
import { dayKey } from "@/lib/format";

// ---------- view-model ----------

export interface NutritionData {
  /** Totals for the viewed day. */
  day: { calories: number; proteinG: number; carbsG: number; fatG: number };
  targets: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  };
  /** Meals on the viewed day. */
  mealCount: number;
  /** 30 days ending today, dense (zeros for empty days). */
  series: { dayKey: string; label: string; calories: number; isToday: boolean }[];
}

// ---------- date helpers (local time) ----------

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------- main ----------

/** Days of intake history shown on the calorie chart. */
const NUTRITION_DAYS = 30;

/**
 * Totals for `viewKey` (a "YYYY-MM-DD" day) plus the trailing 30-day calorie
 * series ending today. `viewKey` may be older than the chart window, so it is
 * queried explicitly alongside the window.
 */
export async function getNutritionData(
  viewKey: string,
  now: Date = new Date(),
): Promise<NutritionData> {
  // getSettings() repins process.env.TZ, so every dayKey() below buckets
  // against the user's wall clock rather than the serverless default of UTC.
  const settings = await getSettings();

  const startKey = dayKey(addDays(startOfDay(now), -(NUTRITION_DAYS - 1)));
  const meals = await prisma.meal.findMany({
    where: { OR: [{ dayKey: { gte: startKey } }, { dayKey: viewKey }] },
    orderBy: { eatenAt: "asc" },
  });

  return buildNutrition(meals, settings, viewKey, now);
}

// ---------- derivations ----------

type MealRecord = {
  dayKey: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

function buildNutrition(
  meals: MealRecord[],
  settings: AppSettings,
  viewKey: string,
  now: Date,
): NutritionData {
  const todayKey = dayKey(now);

  const caloriesByDay = new Map<string, number>();
  for (const m of meals) {
    caloriesByDay.set(m.dayKey, (caloriesByDay.get(m.dayKey) ?? 0) + m.calories);
  }

  const dayMeals = meals.filter((m) => m.dayKey === viewKey);
  const day = dayMeals.reduce(
    (a, m) => ({
      calories: a.calories + m.calories,
      proteinG: a.proteinG + m.proteinG,
      carbsG: a.carbsG + m.carbsG,
      fatG: a.fatG + m.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  // Dense series — days with nothing logged plot as zero rather than vanishing.
  const start = addDays(startOfDay(now), -(NUTRITION_DAYS - 1));
  const series = Array.from({ length: NUTRITION_DAYS }, (_, i) => {
    const d = addDays(start, i);
    const k = dayKey(d);
    return {
      dayKey: k,
      label: `${MONTHS[d.getMonth()]} ${d.getDate()}`,
      calories: Math.round(caloriesByDay.get(k) ?? 0),
      isToday: k === todayKey,
    };
  });

  return {
    day: {
      calories: Math.round(day.calories),
      proteinG: Math.round(day.proteinG),
      carbsG: Math.round(day.carbsG),
      fatG: Math.round(day.fatG),
    },
    targets: {
      calories: settings.calorieTarget,
      proteinG: settings.proteinTargetG,
      carbsG: settings.carbTargetG,
      fatG: settings.fatTargetG,
    },
    mealCount: dayMeals.length,
    series,
  };
}
