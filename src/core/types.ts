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
}

export interface HealthCache {
  version: 1;
  sourceFile: string;
  importedAt: string;
  recordCount: number;
  skippedCount: number;
  dateRange: { from: string; to: string } | null;
  metrics: Record<string, MetricSeries>;
  workouts: WorkoutEntry[];
}
