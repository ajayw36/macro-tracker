import { Card, SectionLabel } from "@/components/ui";
import type { NutritionData } from "@/lib/metrics";

/** Progress bar for a single macro against its daily target. */
function Bar({
  label,
  value,
  target,
  unit,
}: {
  label: string;
  value: number;
  target: number | null;
  unit: string;
}) {
  const pct = target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className="tnum text-xs text-muted">
          {value}
          {target != null ? ` / ${target}` : ""}
          {unit}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-lime transition-all"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}

export function NutritionToday({ data, dayLabel }: { data: NutritionData; dayLabel: string }) {
  const { day, targets, mealCount } = data;
  const calPct =
    targets.calories && targets.calories > 0
      ? Math.min(100, Math.round((day.calories / targets.calories) * 100))
      : null;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <SectionLabel>{dayLabel}</SectionLabel>
        <span className="text-[11px] text-muted">
          {mealCount > 0 ? `${mealCount} meal${mealCount === 1 ? "" : "s"}` : "No meals yet"}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="tnum text-3xl font-bold text-text">
          {day.calories.toLocaleString()}
        </span>
        <span className="text-sm text-muted">cal</span>
        {targets.calories != null && (
          <span className="ml-1 text-sm text-faint">
            / {targets.calories.toLocaleString()}
          </span>
        )}
      </div>

      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-lime transition-all"
          style={{ width: `${calPct ?? 0}%` }}
        />
      </div>
      <div className="mt-1.5 text-right">
        <span className="tnum text-[11px] text-muted">
          {calPct != null ? `${calPct}%` : "set a target"}
        </span>
      </div>

      <div className="mt-4 space-y-2.5 border-t border-border pt-4">
        <Bar label="Protein" value={day.proteinG} target={targets.proteinG} unit="g" />
        <Bar label="Carbs" value={day.carbsG} target={targets.carbsG} unit="g" />
        <Bar label="Fat" value={day.fatG} target={targets.fatG} unit="g" />
      </div>
    </Card>
  );
}
