import Link from "next/link";
import { getSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { saveSettingsForm } from "@/app/actions";
import { Card, SectionLabel } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const sp = await searchParams;

  let dbError: string | null = null;
  let settings = DEFAULT_SETTINGS;
  try {
    settings = await getSettings();
  } catch (err) {
    dbError = err instanceof Error ? err.message : "db error";
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10">
      <div className="flex items-center justify-between border-b border-border pb-5">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <div className="flex items-center gap-4">
          <Link href="/" className="text-xs text-muted hover:text-lime">
            ← Back
          </Link>
          <a href="/api/logout" className="text-xs text-muted hover:text-lime">
            Sign out
          </a>
        </div>
      </div>

      {sp.saved && (
        <p className="mt-4 text-sm text-lime">Settings saved.</p>
      )}
      {dbError && (
        <p className="mt-4 text-xs text-red-400">DB: {dbError}</p>
      )}

      <form action={saveSettingsForm}>
        {/* Timezone */}
        <Card className="mt-6 space-y-5">
          <SectionLabel>Timezone</SectionLabel>

          <Field label="Timezone (decides which day a meal lands on)">
            <select
              name="timezone"
              defaultValue={settings.timezone}
              className="rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
            >
              {TIMEZONES.some(([tz]) => tz === settings.timezone) || (
                <option value={settings.timezone}>{settings.timezone}</option>
              )}
              {TIMEZONES.map(([tz, label]) => (
                <option key={tz} value={tz}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        {/* Nutrition targets */}
        <Card className="mt-4 space-y-5">
          <SectionLabel>Nutrition targets</SectionLabel>
          <p className="text-xs text-faint">
            Daily goals for the progress bars. Leave blank to just track
            totals without a target.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Calories (kcal)">
              <input
                name="calorieTarget"
                type="number"
                min="0"
                step="10"
                defaultValue={settings.calorieTarget ?? ""}
                placeholder="e.g. 2400"
                className="input"
              />
            </Field>
            <Field label="Protein (g)">
              <input
                name="proteinTargetG"
                type="number"
                min="0"
                step="1"
                defaultValue={settings.proteinTargetG ?? ""}
                placeholder="e.g. 180"
                className="input"
              />
            </Field>
            <Field label="Carbs (g)">
              <input
                name="carbTargetG"
                type="number"
                min="0"
                step="1"
                defaultValue={settings.carbTargetG ?? ""}
                placeholder="e.g. 240"
                className="input"
              />
            </Field>
            <Field label="Fat (g)">
              <input
                name="fatTargetG"
                type="number"
                min="0"
                step="1"
                defaultValue={settings.fatTargetG ?? ""}
                placeholder="e.g. 80"
                className="input"
              />
            </Field>
          </div>

          <button
            type="submit"
            className="rounded-md bg-lime px-4 py-2 text-sm font-semibold text-bg hover:opacity-90"
          >
            Save settings
          </button>
        </Card>
      </form>
    </main>
  );
}

const TIMEZONES: [tz: string, label: string][] = [
  ["America/New_York", "Eastern (New York)"],
  ["America/Chicago", "Central (Chicago)"],
  ["America/Denver", "Mountain (Denver)"],
  ["America/Phoenix", "Arizona (Phoenix)"],
  ["America/Los_Angeles", "Pacific (Los Angeles)"],
  ["America/Anchorage", "Alaska (Anchorage)"],
  ["Pacific/Honolulu", "Hawaii (Honolulu)"],
  ["UTC", "UTC"],
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
