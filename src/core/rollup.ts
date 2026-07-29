import type { DayBucket, MeasureBucket, Policy, SumBucket, DurationBucket } from "./types";

export type Granularity = "day" | "week" | "month";
export type RangeKey = "1M" | "3M" | "1Y" | "all";
export interface RollupPoint { key: string; value: number; min?: number; max?: number; }
export interface ResolvedRange { from: string; to: string; granularity: Granularity; }

function minusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - months, 1)); // 1. des Zielmonats
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay)); // Tag auf letzten gültigen Tag des Zielmonats klemmen
  return dt.toISOString().slice(0, 10);
}

export function resolveRange(range: RangeKey, dateRange: { from: string; to: string }): ResolvedRange {
  const to = dateRange.to;
  switch (range) {
    case "1M": return { from: minusMonths(to, 1), to, granularity: "day" };
    case "3M": return { from: minusMonths(to, 3), to, granularity: "day" };
    case "1Y": return { from: minusMonths(to, 12), to, granularity: "week" };
    case "all": return { from: dateRange.from, to, granularity: "month" };
  }
}

function isoWeekKey(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7; // Mo=0
  dt.setUTCDate(dt.getUTCDate() - day + 3); // Donnerstag der Woche
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstThuDay = (firstThu.getUTCDay() + 6) % 7;
  const week = 1 + Math.round(((dt.getTime() - firstThu.getTime()) / 86400000 - 3 + firstThuDay) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function bucketKey(day: string, g: Granularity): string {
  if (g === "day") return day;
  if (g === "month") return day.slice(0, 7);
  return isoWeekKey(day);
}

/** Akkumulator für die measure-Policy. Wandert bewusst hierher statt in jeden Aufrufer:
 *  Tagesmittel sind NICHT gleichgewichtet mittelbar — ein Tag mit 200 Messungen wiegt
 *  schwerer als einer mit dreien, deshalb `avg * count` und Division durch die Gesamtzahl.
 *  Diese Gewichtung stand vorher hier und in computeStats getrennt; wer sie an einer
 *  Stelle korrigiert, hätte die andere still falsch zurückgelassen. */
export interface MeasureAcc { wSum: number; count: number; min: number; max: number; }

export function emptyMeasureAcc(): MeasureAcc {
  return { wSum: 0, count: 0, min: Infinity, max: -Infinity };
}

export function addMeasure(acc: MeasureAcc, mb: MeasureBucket): void {
  acc.wSum += mb.avg * mb.count;
  acc.count += mb.count;
  acc.min = Math.min(acc.min, mb.min);
  acc.max = Math.max(acc.max, mb.max);
}

/** Gewichtetes Mittel, oder `undefined` wenn kein einziger Messwert eingegangen ist —
 *  die Unterscheidung „keine Daten" vs. „Mittelwert 0" trifft der Aufrufer. */
export function measureAvg(acc: MeasureAcc): number | undefined {
  return acc.count ? acc.wSum / acc.count : undefined;
}

interface Acc extends MeasureAcc { sum: number; }

export function rollupDaily(daily: Record<string, DayBucket>, policy: Policy, r: ResolvedRange): RollupPoint[] {
  const buckets = new Map<string, Acc>();
  for (const day of Object.keys(daily)) {
    if (day < r.from || day > r.to) continue;
    const key = bucketKey(day, r.granularity);
    let acc = buckets.get(key);
    if (!acc) { acc = { sum: 0, ...emptyMeasureAcc() }; buckets.set(key, acc); }
    const b = daily[day];
    if (policy === "sum") {
      acc.sum += (b as SumBucket).sum;
    } else if (policy === "duration") {
      acc.sum += (b as DurationBucket).minutes;
    } else {
      addMeasure(acc, b as MeasureBucket);
    }
  }
  const out: RollupPoint[] = [];
  for (const [key, acc] of buckets) {
    if (policy === "measure") {
      // 0 statt undefined: ein Punkt im Chart braucht eine Zahl.
      out.push({ key, value: measureAvg(acc) ?? 0, min: acc.min, max: acc.max });
    } else {
      out.push({ key, value: acc.sum });
    }
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}
