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
    expect(s.monthly).toEqual([{ key: "2026-01", value: 2 }, { key: "2026-02", value: 1 }]);
  });
  it("recent: neueste zuerst, limitiert", () => {
    const s = summarizeWorkouts(ws, 2);
    expect(s.recent.map((r) => r.date)).toEqual(["2026-02-02", "2026-01-20"]);
    expect(s.recent[0].type).toBe("Cycling");
  });
});
