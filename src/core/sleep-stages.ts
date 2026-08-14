import type { SleepStageDay } from "./types";
import { bucketKey, type ResolvedRange } from "./rollup";

/** Die vier stapelbaren Phasen. `awake` fehlt bewusst: Wachzeit ist kein Schlaf. */
export type StageKey = "deep" | "core" | "rem" | "unspecified";

export const STAGE_ORDER: StageKey[] = ["deep", "core", "rem", "unspecified"];

export interface StagePoint {
  /** Bucket-Schlüssel wie bei `rollupDaily` — Tag, ISO-Woche oder Monat. */
  key: string;
  /** Durchschnittliche Minuten je Nacht des Buckets. */
  stages: Record<StageKey, number>;
  /** Nächte mit Schlafminuten im Bucket. */
  nights: number;
  /** Durchschnittliche Wachminuten je Nacht. */
  awakeAvg: number;
}

export interface StageRollup {
  points: StagePoint[];
  /**
   * Anteil der Nächte mit Schlaf, die AUSSCHLIESSLICH unbestimmte Zeit tragen (0–1).
   * Trägt die Hinweiszeile unter dem Chart: Vor watchOS 9 kennt der Export keine
   * Phasen, sieben von neun Jahren im Bestand sind deshalb ein einfarbiger Block.
   * Ohne die Einordnung liest sich der als Defekt statt als Gerätewechsel.
   */
  unspecifiedShare: number;
  /** Nächte mit Schlafminuten im gesamten Zeitraum. */
  nights: number;
}

function emptyStages(): Record<StageKey, number> {
  return { deep: 0, core: 0, rem: 0, unspecified: 0 };
}

export function rollupSleepStages(
  stages: Record<string, SleepStageDay>, r: ResolvedRange,
): StageRollup {
  const buckets = new Map<string, { sums: Record<StageKey, number>; awake: number; nights: number; unspecOnly: number }>();
  for (const day of Object.keys(stages)) {
    if (day < r.from || day > r.to) continue;
    const v = stages[day];
    // Nächte ohne jede Schlafminute bleiben draußen. Im echten Export tragen 544 von
    // 2044 Nächten nur Liege- oder Wachzeit — im Nenner zögen sie jeden Schnitt nach
    // unten, ohne dass jemand kürzer geschlafen hätte. Der Durchschnitt beantwortet
    // „wie sah eine Nacht aus, in der gemessen wurde", nicht „wie oft wurde gemessen".
    if (!STAGE_ORDER.some((s) => v[s] > 0)) continue;
    const key = bucketKey(day, r.granularity);
    let acc = buckets.get(key);
    if (!acc) { acc = { sums: emptyStages(), awake: 0, nights: 0, unspecOnly: 0 }; buckets.set(key, acc); }
    acc.nights++;
    // Eine Nacht gilt nur dann als unbestimmt, wenn KEINE echte Phase dabei ist —
    // am Gerätewechsel kommt beides in derselben Nacht vor.
    if (v.deep === 0 && v.core === 0 && v.rem === 0) acc.unspecOnly++;
    acc.awake += v.awake;
    for (const s of STAGE_ORDER) acc.sums[s] += v[s];
  }

  let nights = 0;
  let unspecOnly = 0;
  for (const acc of buckets.values()) { nights += acc.nights; unspecOnly += acc.unspecOnly; }

  const points: StagePoint[] = [];
  for (const [key, acc] of buckets) {
    const avg = emptyStages();
    for (const s of STAGE_ORDER) avg[s] = acc.sums[s] / acc.nights;
    points.push({ key, stages: avg, nights: acc.nights, awakeAvg: acc.awake / acc.nights });
  }
  points.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { points, unspecifiedShare: nights ? unspecOnly / nights : 0, nights };
}
