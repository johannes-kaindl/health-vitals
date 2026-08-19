import type { WorkoutEntry } from "./types";

export interface WorkoutRow {
  type: string;
  date: string;
  durationMin: number;
  distanceKm?: number;
  energyKcal?: number;
}

/** `value` ist die Anzahl und behält den Namen, weil `monthly` unverändert als
 *  `RollupPoint[]` in `buildChartGeometry` geht. */
export interface WorkoutMonth {
  key: string;
  value: number;
  distanceKm: number;
  energyKcal: number;
}

export interface WorkoutSummary { monthly: WorkoutMonth[]; recent: WorkoutRow[]; }

export function summarizeWorkouts(workouts: WorkoutEntry[], recentLimit: number): WorkoutSummary {
  const months = new Map<string, WorkoutMonth>();
  for (const w of workouts) {
    const key = w.start.slice(0, 7);
    const m = months.get(key) ?? { key, value: 0, distanceKm: 0, energyKcal: 0 };
    m.value += 1;
    m.distanceKm += w.distanceKm ?? 0;
    m.energyKcal += w.energyKcal ?? 0;
    months.set(key, m);
  }
  // Summen runden: 5.5 + 7.25 ist exakt, 0.1 + 0.2 wäre es nicht — und eine Monatssumme
  // "12.750000000000002 km" im Dashboard sähe nach einem Defekt aus.
  const monthly = [...months.values()]
    .map((m) => ({ ...m, distanceKm: round2(m.distanceKm), energyKcal: round2(m.energyKcal) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // Auch Zeilenwerte runden: Ein Workout kann schon über mehrere WorkoutStatistics-Elemente
  // summiert ankommen (src/core/health-parser.ts:132,137), hat also Gleitkomma-Fehler, bevor
  // eine Monatssumme gebildet wird. Rundung gehört dorthin, wo die Zahl entsteht, nicht in die
  // Anzeige von Aufgabe 7 — sonst müssten CSV-Export, Tooltip, weitere Ansichten sie erneut mitbringen.
  const recent = [...workouts]
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))
    .slice(0, recentLimit)
    .map((w) => {
      const row: WorkoutRow = { type: w.type, date: w.start.slice(0, 10), durationMin: w.durationMin };
      if (w.distanceKm !== undefined) row.distanceKm = round2(w.distanceKm);
      if (w.energyKcal !== undefined) row.energyKcal = round2(w.energyKcal);
      return row;
    });

  return { monthly, recent };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
