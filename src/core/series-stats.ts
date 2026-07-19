import type { DayBucket, MeasureBucket, Policy, SumBucket, DurationBucket } from "./types";
import type { ResolvedRange } from "./rollup";

export interface SeriesStats {
  policy: Policy;
  avgPerDay?: number; maxDay?: number; total?: number;
  avg?: number; min?: number; max?: number; last?: number;
}

export function computeStats(daily: Record<string, DayBucket>, policy: Policy, r: ResolvedRange): SeriesStats {
  const days = Object.keys(daily).filter((d) => d >= r.from && d <= r.to).sort();
  if (policy === "measure") {
    let wSum = 0, count = 0, min = Infinity, max = -Infinity;
    for (const d of days) {
      const mb = daily[d] as MeasureBucket;
      wSum += mb.avg * mb.count; count += mb.count;
      min = Math.min(min, mb.min); max = Math.max(max, mb.max);
    }
    const last = days.length ? (daily[days[days.length - 1]] as MeasureBucket).avg : undefined;
    return {
      policy,
      avg: count ? wSum / count : undefined,
      min: days.length ? min : undefined,
      max: days.length ? max : undefined,
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
