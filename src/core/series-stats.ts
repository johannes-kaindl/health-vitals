import type { DayBucket, MeasureBucket, Policy, SumBucket, DurationBucket } from "./types";
import { addMeasure, emptyMeasureAcc, measureAvg, type ResolvedRange } from "./rollup";

export interface SeriesStats {
  policy: Policy;
  avgPerDay?: number; maxDay?: number; total?: number;
  avg?: number; min?: number; max?: number; last?: number;
}

export function computeStats(daily: Record<string, DayBucket>, policy: Policy, r: ResolvedRange): SeriesStats {
  const days = Object.keys(daily).filter((d) => d >= r.from && d <= r.to).sort();
  if (policy === "measure") {
    const acc = emptyMeasureAcc();
    for (const d of days) addMeasure(acc, daily[d] as MeasureBucket);
    const last = days.length ? (daily[days[days.length - 1]] as MeasureBucket).avg : undefined;
    return {
      policy,
      avg: measureAvg(acc),
      // min/max hängen an `days.length`, nicht an acc.count: ohne Tage im Zeitraum
      // stünden dort die Initialwerte ±Infinity.
      min: days.length ? acc.min : undefined,
      max: days.length ? acc.max : undefined,
      last,
    };
  }
  let total = 0, maxDay = 0;
  for (const d of days) {
    const v = policy === "sum" ? (daily[d] as SumBucket).sum : (daily[d] as DurationBucket).minutes;
    total += v; maxDay = Math.max(maxDay, v);
  }
  return {
    policy,
    total,
    avgPerDay: days.length ? total / days.length : undefined,
    maxDay: days.length ? maxDay : undefined,
  };
}
