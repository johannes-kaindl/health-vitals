import { summarizeWorkouts } from "../../src/core/workout-summary";
import type { WorkoutEntry } from "../../src/core/types";

describe("summarizeWorkouts", () => {
  const ws: WorkoutEntry[] = [
    { type: "Running", start: "2026-01-05T08:00", durationMin: 30 },
    { type: "Running", start: "2026-01-20T08:00", durationMin: 40 },
    { type: "Cycling", start: "2026-02-02T18:00", durationMin: 60 },
  ];
  it("monatliche Anzahl je Monat, aufsteigend sortiert", () => {
    const s = summarizeWorkouts(ws, 10);
    expect(s.monthly).toEqual([
      { key: "2026-01", value: 2, distanceKm: 0, energyKcal: 0 },
      { key: "2026-02", value: 1, distanceKm: 0, energyKcal: 0 },
    ]);
  });
  it("recent: neueste zuerst, limitiert", () => {
    const s = summarizeWorkouts(ws, 2);
    expect(s.recent.map((r) => r.date)).toEqual(["2026-02-02", "2026-01-20"]);
    expect(s.recent[0].type).toBe("Cycling");
  });

  const wsWithMetrics: WorkoutEntry[] = [
    { type: "Running", start: "2026-01-05T08:00", durationMin: 30, distanceKm: 5.5, energyKcal: 320 },
    { type: "Running", start: "2026-01-20T08:00", durationMin: 40, distanceKm: 7.25, energyKcal: 410 },
    { type: "Cycling", start: "2026-02-02T18:00", durationMin: 60, distanceKm: 24, energyKcal: 700 },
    { type: "Yoga", start: "2026-02-10T19:00", durationMin: 35, energyKcal: 142 },
  ];

  it("summiert Distanz und Energie je Monat", () => {
    const s = summarizeWorkouts(wsWithMetrics, 10);
    expect(s.monthly).toEqual([
      { key: "2026-01", value: 2, distanceKm: 12.75, energyKcal: 730 },
      { key: "2026-02", value: 2, distanceKm: 24, energyKcal: 842 },
    ]);
  });

  it("Zeilen tragen die Kennzahlen des Workouts", () => {
    const s = summarizeWorkouts(wsWithMetrics, 10);
    const yoga = s.recent.find((r) => r.type === "Yoga")!;
    expect(yoga.distanceKm).toBeUndefined();
    expect(yoga.energyKcal).toBe(142);
    const lauf = s.recent.find((r) => r.date === "2026-01-20")!;
    expect(lauf.distanceKm).toBe(7.25);
  });
});
