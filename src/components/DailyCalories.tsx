"use client";

import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { NutritionData } from "@/lib/metrics";
import { SectionLabel } from "@/components/ui";

export function DailyCalories({ data }: { data: NutritionData }) {
  const { series, targets } = data;
  const logged = series.filter((d) => d.calories > 0);
  const avg = logged.length
    ? Math.round(logged.reduce((s, d) => s + d.calories, 0) / logged.length)
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionLabel>Daily Calories</SectionLabel>
        <span className="tnum text-xs text-muted">
          {logged.length ? `${logged.length}d logged · ${avg.toLocaleString()} avg` : "no data yet"}
        </span>
      </div>
      <div className="mt-3 h-28 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#5c6150", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            {targets.calories != null && (
              <ReferenceLine
                y={targets.calories}
                stroke="#9bbd2e"
                strokeDasharray="5 5"
                strokeWidth={1.5}
              />
            )}
            <Tooltip
              cursor={{ fill: "rgba(205,250,62,0.06)" }}
              contentStyle={{
                background: "#101208",
                border: "1px solid #303620",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#8a8f7a" }}
              itemStyle={{ color: "#e9ecdf" }}
              formatter={(v) => [`${Number(v).toLocaleString()} cal`, "Intake"]}
            />
            <Bar dataKey="calories" radius={[3, 3, 0, 0]}>
              {series.map((d, i) => (
                <Cell key={i} fill={d.isToday ? "#cdfa3e" : "#3c4426"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
