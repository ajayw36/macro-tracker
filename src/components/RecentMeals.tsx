"use client";

import { useState, useTransition } from "react";
import { logMealAgain } from "@/app/actions";
import { SectionLabel } from "@/components/ui";

export interface RecentMeal {
  id: string;
  name: string;
  itemSummary: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Midday on the viewed day, so a re-logged meal lands on that date. */
function eatenAtFor(dayKey: string, isToday: boolean): number {
  if (isToday) return Date.now();
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
}

export function RecentMeals({
  meals,
  dayKey,
  isToday,
}: {
  meals: RecentMeal[];
  dayKey: string;
  isToday: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const shown = open ? meals : meals.slice(0, 3);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <SectionLabel>Log again</SectionLabel>
        {meals.length > 3 && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-[11px] text-muted transition hover:text-lime"
          >
            {open ? "show less" : `show all ${meals.length}`}
          </button>
        )}
      </div>

      <ul className="mt-3 divide-y divide-border">
        {shown.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-4 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{m.name}</p>
              {m.itemSummary && (
                <p className="truncate text-xs text-faint">{m.itemSummary}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="tnum text-xs text-muted">
                {Math.round(m.calories)} cal · {Math.round(m.proteinG)}p
              </span>
              <button
                aria-label={`Log ${m.name} again`}
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setBusyId(m.id);
                    setError(null);
                    const res = await logMealAgain(m.id, eatenAtFor(dayKey, isToday));
                    if (!res.ok) setError(res.error ?? "Could not log.");
                    setBusyId(null);
                  })
                }
                className="rounded-md border border-border-strong bg-bg-elevated px-2.5 py-1 text-xs font-semibold text-text transition hover:border-lime/50 hover:text-lime disabled:opacity-40"
              >
                {busyId === m.id ? "…" : "+"}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
