import { computeStats } from "../../src/core/series-stats";
import type { DayBucket } from "../../src/core/types";

const r = { from: "2026-01-01", to: "2026-01-31", granularity: "day" as const };

describe("series-stats", () => {
  it("sum: total / Ø-pro-Tag-mit-Daten / max-Tag", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { sum: 10, count: 1 },
      "2026-01-02": { sum: 20, count: 1 },
      "2025-12-31": { sum: 99, count: 1 }, // außerhalb
    };
    expect(computeStats(daily, "sum", r)).toEqual({ policy: "sum", total: 30, avgPerDay: 15, maxDay: 20 });
  });

  it("measure: gewichteter Ø, globales min/max, letzter Wert", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { min: 50, max: 70, avg: 60, count: 1 },
      "2026-01-10": { min: 55, max: 90, avg: 65, count: 1 },
    };
    const s = computeStats(daily, "measure", r);
    expect(s.avg).toBe(62.5);
    expect(s.min).toBe(50);
    expect(s.max).toBe(90);
    expect(s.last).toBe(65); // spätester Tag
  });

  it("duration: Minuten-Summe", () => {
    const daily: Record<string, DayBucket> = { "2026-01-01": { minutes: 400, count: 2 } };
    expect(computeStats(daily, "duration", r)).toEqual({ policy: "duration", total: 400, avgPerDay: 400, maxDay: 400 });
  });
});
