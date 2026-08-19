import type { Policy } from "./aggregation-policy";
export type { Policy };

export interface SumBucket { sum: number; count: number; }
export interface MeasureBucket { min: number; max: number; avg: number; count: number; }
export interface DurationBucket { minutes: number; count: number; }
export type DayBucket = SumBucket | MeasureBucket | DurationBucket;

export interface MetricSeries {
  unit: string;
  policy: Policy;
  daily: Record<string, DayBucket>; // Key: "YYYY-MM-DD"
}

export interface WorkoutEntry {
  type: string;        // workoutActivityType
  start: string;       // "YYYY-MM-DDTHH:MM"
  durationMin: number;
  /** Gesamtstrecke in km. Fehlt bei Workouts ohne Distanz (Yoga, Krafttraining). */
  distanceKm?: number;
  /** Aktiv verbrannte Energie in kcal, ohne Grundumsatz. */
  energyKcal?: number;
}

/** Vereinigte Minuten je Schlafphase einer Nacht. */
export interface SleepStageDay {
  core: number;
  deep: number;
  rem: number;
  unspecified: number;
  awake: number;
}

export interface HealthCache {
  /**
   * 1 → Schlaf als aufaddierte Record-Dauern (überzählt, bis zu 33,6 h/Tag).
   * 2 → Schlaf als vereinigte Intervalle je Nacht, in zwei Serien getrennt.
   * 3 → Workouts tragen Distanz und aktive Energie aus ihren WorkoutStatistics.
   *
   * Die Anhebung ist die eigentliche Migration: Ein alter Cache lässt sich nicht
   * umrechnen, weil die fehlende Information beim Import weggeworfen wurde — bei
   * Version 1 die Unterscheidung Liegezeit/Phase, bei Version 2 die Kennzahlen der
   * Kindelemente, die der Parser damals gar nicht las. Er muss neu erzeugt werden;
   * ein stillschweigend weiterverwendeter Alt-Cache zeigte sonst dauerhaft leere
   * Kennzahlen, die wie „keine Distanz aufgezeichnet" aussehen.
   */
  version: 3;
  sourceFile: string;
  importedAt: string;
  recordCount: number;
  skippedCount: number;
  dateRange: { from: string; to: string } | null;
  metrics: Record<string, MetricSeries>;
  workouts: WorkoutEntry[];
  /** Key: "YYYY-MM-DD" (Aufwachtag). Fehlt in Caches, die keinen Schlaf enthalten. */
  sleepStages?: Record<string, SleepStageDay>;
}
