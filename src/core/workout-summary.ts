import type { WorkoutEntry } from "./types";

export interface WorkoutRow { type: string; date: string; durationMin: number; }
export interface WorkoutSummary { monthly: Array<{ key: string; value: number }>; recent: WorkoutRow[]; }

export function summarizeWorkouts(workouts: WorkoutEntry[], recentLimit: number): WorkoutSummary {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    const month = w.start.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const monthly = [...counts.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const recent = [...workouts]
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))
    .slice(0, recentLimit)
    .map((w) => ({ type: w.type, date: w.start.slice(0, 10), durationMin: w.durationMin }));

  return { monthly, recent };
}
