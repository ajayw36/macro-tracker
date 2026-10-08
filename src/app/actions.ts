"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings, setSetting } from "@/lib/settings";
import { dayKey } from "@/lib/format";
import { MealItemSchema, sumItems, type MealItem } from "@/lib/nutrition";
import { requireDashboardAuth } from "@/lib/require-auth";
import * as z from "zod";

function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveSettingsForm(formData: FormData): Promise<void> {
  await requireDashboardAuth();

  const timezone = formData.get("timezone") as string | null;
  if (timezone && isValidTimeZone(timezone)) await setSetting("timezone", timezone);

  const toCount = (raw: FormDataEntryValue | null): number | null => {
    if (raw == null || raw === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
  };
  await setSetting("calorieTarget", toCount(formData.get("calorieTarget")));
  await setSetting("proteinTargetG", toCount(formData.get("proteinTargetG")));
  await setSetting("carbTargetG", toCount(formData.get("carbTargetG")));
  await setSetting("fatTargetG", toCount(formData.get("fatTargetG")));

  revalidatePath("/");
  redirect("/settings?saved=1");
}

// ---------- nutrition ----------

const MealInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).optional().nullable(),
  items: z.array(MealItemSchema).min(1).max(40),
  source: z.enum(["ai_photo", "ai_text", "manual"]),
  /** Epoch ms. Optional so the caller can just mean "now". */
  eatenAt: z.number().int().positive().optional().nullable(),
});

export type MealInput = z.input<typeof MealInputSchema>;

/** Normalize an item list: coerce to finite non-negative numbers, round to 1dp. */
function cleanItems(items: MealItem[]): MealItem[] {
  const n = (v: number) => {
    const x = Number(v);
    return Number.isFinite(x) && x > 0 ? Math.round(x * 10) / 10 : 0;
  };
  return items.map((i) => ({
    name: i.name.trim() || "Item",
    quantity: i.quantity.trim(),
    calories: n(i.calories),
    proteinG: n(i.proteinG),
    carbsG: n(i.carbsG),
    fatG: n(i.fatG),
  }));
}

function revalidateNutrition(): void {
  revalidatePath("/");
}

export async function saveMeal(
  input: MealInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireDashboardAuth();
    const parsed = MealInputSchema.parse(input);
    // getSettings() repins process.env.TZ, so dayKey() below buckets against the
    // user's wall clock rather than the serverless default of UTC.
    await getSettings();

    const items = cleanItems(parsed.items);
    const totals = sumItems(items);
    const eatenAt = parsed.eatenAt ? new Date(parsed.eatenAt) : new Date();

    await prisma.meal.create({
      data: {
        dayKey: dayKey(eatenAt),
        eatenAt,
        name: parsed.name,
        notes: parsed.notes?.trim() || null,
        items,
        ...totals,
        source: parsed.source,
      },
    });
    revalidateNutrition();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "save_failed") };
  }
}

export async function updateMeal(
  id: string,
  input: MealInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireDashboardAuth();
    const parsed = MealInputSchema.parse(input);
    const items = cleanItems(parsed.items);
    // dayKey is intentionally left as first written — editing a meal's macros
    // must not move it to another day.
    await prisma.meal.update({
      where: { id },
      data: {
        name: parsed.name,
        notes: parsed.notes?.trim() || null,
        items,
        ...sumItems(items),
      },
    });
    revalidateNutrition();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "update_failed") };
  }
}

export async function deleteMeal(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireDashboardAuth();
    await prisma.meal.delete({ where: { id } });
    revalidateNutrition();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "delete_failed") };
  }
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof z.ZodError) return "That meal didn't look right. Check the numbers.";
  return err instanceof Error ? err.message : fallback;
}

/**
 * Re-log a meal you've eaten before. Copies the stored items and totals onto a
 * new row rather than referencing the original, so editing or deleting either
 * one leaves the other alone. No favorites table needed — every logged meal is
 * already a reusable template.
 */
export async function logMealAgain(
  sourceId: string,
  eatenAtMs?: number | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireDashboardAuth();
    await getSettings(); // repins TZ before dayKey()

    const src = await prisma.meal.findUnique({ where: { id: sourceId } });
    if (!src) return { ok: false, error: "That meal no longer exists." };

    const eatenAt = eatenAtMs ? new Date(eatenAtMs) : new Date();
    if (Number.isNaN(eatenAt.getTime())) return { ok: false, error: "Invalid date." };

    await prisma.meal.create({
      data: {
        dayKey: dayKey(eatenAt),
        eatenAt,
        name: src.name,
        notes: src.notes,
        items: src.items ?? [],
        calories: src.calories,
        proteinG: src.proteinG,
        carbsG: src.carbsG,
        fatG: src.fatG,
        source: src.source,
      },
    });
    revalidateNutrition();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, "log_failed") };
  }
}
