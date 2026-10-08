// App settings, persisted in the Setting key/value table, with sensible defaults.

import { prisma } from "@/lib/db";

export interface AppSettings {
  /** IANA timezone used for all day bucketing (e.g. "America/Los_Angeles"). */
  timezone: string;
  /**
   * Daily nutrition targets, stored as entered — calories in kcal, macros in
   * grams.
   */
  calorieTarget: number | null;
  proteinTargetG: number | null;
  carbTargetG: number | null;
  fatTargetG: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  timezone: process.env.APP_TZ ?? "America/New_York",
  calorieTarget: null,
  proteinTargetG: null,
  carbTargetG: null,
  fatTargetG: null,
};

export async function getSettings(): Promise<AppSettings> {
  const rows = await prisma.setting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const get = <T>(key: keyof AppSettings, fallback: T): T => {
    const v = map.get(key);
    return v === undefined || v === null ? fallback : (v as T);
  };
  const settings: AppSettings = {
    timezone: get("timezone", DEFAULT_SETTINGS.timezone),
    calorieTarget: get("calorieTarget", DEFAULT_SETTINGS.calorieTarget),
    proteinTargetG: get("proteinTargetG", DEFAULT_SETTINGS.proteinTargetG),
    carbTargetG: get("carbTargetG", DEFAULT_SETTINGS.carbTargetG),
    fatTargetG: get("fatTargetG", DEFAULT_SETTINGS.fatTargetG),
  };
  // Repin the process timezone to the stored setting. getSettings() is called
  // before any date bucketing (getNutritionData and the meal actions do it
  // first), so this is the one choke point that keeps the local-time getters in
  // format.ts/metrics.ts on the user's wall clock. Complements the boot-time
  // pin in db.ts, which only knows env.
  process.env.TZ = settings.timezone;
  return settings;
}

export async function setSetting(key: keyof AppSettings, value: unknown): Promise<void> {
  // Setting.value is a non-nullable Json column, so a null can't be stored in
  // it — clearing a setting means removing the row and letting getSettings()
  // fall back to the default. deleteMany is used because it is a no-op when the
  // row was never written, whereas delete throws.
  if (value === null || value === undefined) {
    await prisma.setting.deleteMany({ where: { key } });
    return;
  }
  await prisma.setting.upsert({
    where: { key },
    create: { key, value: value as object },
    update: { value: value as object },
  });
}
