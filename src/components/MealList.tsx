"use client";

import { useState, useTransition } from "react";
import { deleteMeal } from "@/app/actions";
import { SectionLabel } from "@/components/ui";

export interface MealRow {
  id: string;
  name: string;
  timeLabel: string;
  itemSummary: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export function MealList({ meals, dayLabel }: { meals: MealRow[]; dayLabel: string }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totals = meals.reduce(
    (a, m) => ({
      calories: a.calories + m.calories,
      proteinG: a.proteinG + m.proteinG,
      carbsG: a.carbsG + m.carbsG,
      fatG: a.fatG + m.fatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <SectionLabel>{dayLabel}</SectionLabel>
        {meals.length > 0 && (
          <span className="tnum text-sm text-muted">
            {Math.round(totals.calories)} cal · {Math.round(totals.proteinG)}p ·{" "}
            {Math.round(totals.carbsG)}c · {Math.round(totals.fatG)}f
          </span>
        )}
      </div>

      {meals.length === 0 ? (
        <p className="mt-4 text-sm text-faint">Nothing logged yet today.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {meals.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{m.name}</p>
                {m.itemSummary && (
                  <p className="mt-0.5 truncate text-xs text-faint">{m.itemSummary}</p>
                )}
                <p className="tnum mt-1 text-xs text-muted">
                  {Math.round(m.proteinG)}p · {Math.round(m.carbsG)}c · {Math.round(m.fatG)}f
                  <span className="ml-2 text-faint">{m.timeLabel}</span>
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="tnum text-sm font-bold text-text">
                  {Math.round(m.calories)}
                  <span className="ml-1 text-xs font-normal text-muted">cal</span>
                </span>
                <button
                  aria-label={`Delete ${m.name}`}
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setBusyId(m.id);
                      setError(null);
                      const res = await deleteMeal(m.id);
                      if (!res.ok) setError(res.error ?? "Could not delete.");
                      setBusyId(null);
                    })
                  }
                  className="text-faint transition hover:text-lime disabled:opacity-40"
                >
                  {busyId === m.id ? "…" : "×"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  );
}
