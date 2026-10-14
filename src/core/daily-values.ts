import type { DayBucket, HealthCache } from "./types";
import { METRIC_SLEEP_ASLEEP } from "./sleep-session";

/**
 * Die Felder, die das Plugin ins Frontmatter einer Daily Note schreibt. Der Präfix `health_`
 * hält sie von Properties fern, die der Nutzer selbst pflegt (`steps`, `sleep` …): ein
 * gleichnamiges Feld würde sonst als „schon vorhanden" stehen bleiben und nie befüllt.
 * Die Namen sind Schlüssel in fremden Notizen und Bases — sie ändern sich nicht mit der Sprache.
 */
export interface DailyField {
  key: string;
  metric: string;
  /** Wert aus dem Tages-Eimer; `undefined`, wenn der Eimer die Größe nicht trägt. */
  pick: (b: DayBucket) => number | undefined;
}

const sum = (b: DayBucket): number | undefined => ("sum" in b ? b.sum : undefined);
const avg = (b: DayBucket): number | undefined => ("avg" in b ? b.avg : undefined);
const hours = (b: DayBucket): number | undefined => ("minutes" in b ? b.minutes / 60 : undefined);

export const DAILY_FIELDS: readonly DailyField[] = [
  { key: "health_steps", metric: "HKQuantityTypeIdentifierStepCount", pick: sum },
  { key: "health_sleep_h", metric: METRIC_SLEEP_ASLEEP, pick: hours },
  { key: "health_resting_hr", metric: "HKQuantityTypeIdentifierRestingHeartRate", pick: avg },
  { key: "health_hrv_ms", metric: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN", pick: avg },
  { key: "health_active_kcal", metric: "HKQuantityTypeIdentifierActiveEnergyBurned", pick: sum },
];

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Die Tageswerte des Caches für einen Tag; nur Felder, für die der Export etwas trägt. */
export function dailyValues(cache: HealthCache, day: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of DAILY_FIELDS) {
    const bucket = cache.metrics[f.metric]?.daily[day];
    if (!bucket) continue;
    const v = f.pick(bucket);
    if (v !== undefined && Number.isFinite(v)) out[f.key] = round1(v);
  }
  return out;
}
