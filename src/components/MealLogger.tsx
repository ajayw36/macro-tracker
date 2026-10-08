"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { saveMeal } from "@/app/actions";
import { SectionLabel } from "@/components/ui";
import type { MealItem } from "@/lib/nutrition";

const BTN_PRIMARY =
  "rounded-md bg-lime px-4 py-2 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50";
const BTN_GHOST =
  "rounded-md border border-border-strong bg-bg-elevated px-3 py-1.5 text-xs font-semibold text-text transition hover:border-lime/50 hover:text-lime disabled:opacity-50";

/** Longest edge, in px, an upload is downscaled to before it leaves the browser. */
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;

type Phase = "input" | "analyzing" | "review";

interface Estimate {
  name: string;
  items: MealItem[];
  confidence: "high" | "medium" | "low";
  assumptions: string[];
}

/**
 * Downscale a photo in the browser. A raw phone photo is 3–5MB; this lands near
 * 150KB, which keeps the upload small and cuts image-token cost. Claude
 * downsamples large images anyway, so no accuracy is lost.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file; // no canvas support — send the original and let the server cap it
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  return blob ?? file;
}

const BLANK_ITEM: MealItem = {
  name: "",
  quantity: "",
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
};

/** `datetime-local` wants "YYYY-MM-DDTHH:mm" in local time. */
function defaultWhen(dayKey: string, isToday: boolean): string {
  const now = new Date();
  const hhmm = isToday
    ? `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    : "12:00"; // a backdated meal has no known time; midday is a neutral default
  return `${dayKey}T${hhmm}`;
}

export function MealLogger({
  dayKey,
  isToday,
}: {
  dayKey: string;
  isToday: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("input");
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [items, setItems] = useState<MealItem[]>([]);
  const [mealName, setMealName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [when, setWhen] = useState(() => defaultWhen(dayKey, isToday));
  const [saving, startSaving] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);

  // Derived during render rather than stored in state, so no cascading render.
  // Object URLs are a manual resource, so the effect below releases each one
  // when the selection changes and on unmount.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function reset() {
    setPhase("input");
    setFile(null);
    setDescription("");
    setEstimate(null);
    setItems([]);
    setMealName("");
    setError(null);
    setWhen(defaultWhen(dayKey, isToday));
    if (fileInput.current) fileInput.current.value = "";
  }

  async function analyze() {
    setError(null);
    if (!file && !description.trim()) {
      setError("Add a photo or describe the meal.");
      return;
    }
    setPhase("analyzing");
    try {
      const body = new FormData();
      if (file) body.append("image", await downscale(file), "meal.jpg");
      if (description.trim()) body.append("description", description.trim());

      const res = await fetch("/api/nutrition/analyze", { method: "POST", body });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? `Request failed (${res.status})`);

      const est = json.estimate as Estimate;
      setEstimate(est);
      setItems(est.items);
      setMealName(est.name);
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
      setPhase("input");
    }
  }

  function patchItem(idx: number, patch: Partial<MealItem>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  const totals = items.reduce(
    (a, i) => ({
      calories: a.calories + (Number(i.calories) || 0),
      proteinG: a.proteinG + (Number(i.proteinG) || 0),
      carbsG: a.carbsG + (Number(i.carbsG) || 0),
      fatG: a.fatG + (Number(i.fatG) || 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  function save() {
    startSaving(async () => {
      setError(null);
      // Local-time string -> epoch ms. The server derives dayKey from this, so
      // an edited date is what decides which day the meal lands on.
      const ts = new Date(when).getTime();
      const res = await saveMeal({
        name: mealName.trim() || "Meal",
        notes: description.trim() || null,
        items,
        source: file ? "ai_photo" : "ai_text",
        eatenAt: Number.isNaN(ts) ? null : ts,
      });
      if (res.ok) reset();
      else setError(res.error ?? "Could not save.");
    });
  }

  // ---------- review ----------
  if (phase === "review" && estimate) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionLabel>Review &amp; edit</SectionLabel>
          <ConfidenceTag level={estimate.confidence} />
        </div>

        <input
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          aria-label="Meal name"
          className="input mt-3 font-semibold"
        />

        <label className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Eaten</span>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="When this meal was eaten"
            className="input tnum w-auto grow text-xs sm:grow-0"
          />
        </label>

        <div className="mt-4 space-y-2">
          <div className="hidden gap-2 px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint sm:grid sm:grid-cols-[1fr_5rem_4rem_3.5rem_3.5rem_3.5rem_1.5rem]">
            <span>Food</span>
            <span>Amount</span>
            <span className="text-right">Cal</span>
            <span className="text-right">P</span>
            <span className="text-right">C</span>
            <span className="text-right">F</span>
            <span />
          </div>

          {items.map((item, idx) => (
            <div
              key={idx}
              className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-elevated p-2 sm:grid-cols-[1fr_5rem_4rem_3.5rem_3.5rem_3.5rem_1.5rem] sm:border-0 sm:bg-transparent sm:p-0"
            >
              <input
                value={item.name}
                onChange={(e) => patchItem(idx, { name: e.target.value })}
                placeholder="Food"
                aria-label={`Item ${idx + 1} name`}
                className="input col-span-2 sm:col-span-1"
              />
              <input
                value={item.quantity}
                onChange={(e) => patchItem(idx, { quantity: e.target.value })}
                placeholder="Amount"
                aria-label={`Item ${idx + 1} amount`}
                className="input col-span-2 sm:col-span-1"
              />
              <NumCell
                value={item.calories}
                label={`Item ${idx + 1} calories`}
                prefix="cal"
                onChange={(v) => patchItem(idx, { calories: v })}
              />
              <NumCell
                value={item.proteinG}
                label={`Item ${idx + 1} protein`}
                prefix="P"
                onChange={(v) => patchItem(idx, { proteinG: v })}
              />
              <NumCell
                value={item.carbsG}
                label={`Item ${idx + 1} carbs`}
                prefix="C"
                onChange={(v) => patchItem(idx, { carbsG: v })}
              />
              <NumCell
                value={item.fatG}
                label={`Item ${idx + 1} fat`}
                prefix="F"
                onChange={(v) => patchItem(idx, { fatG: v })}
              />
              <button
                onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                aria-label={`Remove ${item.name || `item ${idx + 1}`}`}
                className="self-center text-center text-faint transition hover:text-lime"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={() => setItems((p) => [...p, { ...BLANK_ITEM }])}
          className="mt-2 text-xs font-semibold text-muted transition hover:text-lime"
        >
          + add item
        </button>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-border pt-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Total
          </span>
          <div className="flex items-baseline gap-4">
            <span className="tnum text-2xl font-bold text-text">
              {Math.round(totals.calories)}
              <span className="ml-1 text-sm font-normal text-muted">cal</span>
            </span>
            <span className="tnum text-sm text-muted">
              {Math.round(totals.proteinG)}p · {Math.round(totals.carbsG)}c ·{" "}
              {Math.round(totals.fatG)}f
            </span>
          </div>
        </div>

        {estimate.assumptions.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-border pt-4 text-xs text-faint">
            {estimate.assumptions.map((a, i) => (
              <li key={i}>· {a}</li>
            ))}
          </ul>
        )}

        {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

        <div className="mt-5 flex items-center gap-3">
          <button onClick={save} disabled={saving || items.length === 0} className={BTN_PRIMARY}>
            {saving ? "Saving…" : "Save meal"}
          </button>
          <button onClick={reset} disabled={saving} className={BTN_GHOST}>
            Discard
          </button>
        </div>
      </div>
    );
  }

  // ---------- input / analyzing ----------
  const busy = phase === "analyzing";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionLabel>Log a meal</SectionLabel>
        {!isToday && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-lime">
            backdating
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-4">
        {previewUrl && (
          // A local object URL — next/image can't optimize these.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Selected meal"
            className="h-24 w-24 rounded-lg border border-border object-cover"
          />
        )}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
            className="text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-bg-elevated file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-text hover:file:border-lime/50 hover:file:text-lime"
          />
          {file && (
            <button
              onClick={() => setFile(null)}
              disabled={busy}
              className="self-start text-xs text-faint transition hover:text-lime"
            >
              remove photo
            </button>
          )}
        </div>
      </div>

      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs text-muted">
          Describe it {file ? "(portions, brands, anything on the label)" : "(required without a photo)"}
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={busy}
          rows={3}
          placeholder="about 6oz grilled chicken, 1 cup rice, cooked in olive oil"
          className="input resize-y"
        />
      </label>

      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}

      <button onClick={analyze} disabled={busy} className={`${BTN_PRIMARY} mt-4`}>
        {busy ? "Analyzing…" : "Estimate macros"}
      </button>
    </div>
  );
}

function NumCell({
  value,
  label,
  prefix,
  onChange,
}: {
  value: number;
  label: string;
  prefix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-[10px] uppercase text-faint sm:hidden">{prefix}</span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
        className="input tnum px-2 text-right"
      />
    </label>
  );
}

function ConfidenceTag({ level }: { level: "high" | "medium" | "low" }) {
  const tone =
    level === "high" ? "text-lime" : level === "medium" ? "text-muted" : "text-faint";
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.14em] ${tone}`}>
      {level} confidence
    </span>
  );
}
