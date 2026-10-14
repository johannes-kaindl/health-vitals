import { DAILY_FIELDS, dailyValues } from "../../src/core/daily-values";
import type { HealthCache } from "../../src/core/types";

const cache: HealthCache = {
  version: 5, sourceFile: "", importedAt: "", recordCount: 0, skippedCount: 0, dateRange: null,
  workouts: [],
  metrics: {
    HKQuantityTypeIdentifierStepCount: { unit: "count", policy: "sum", daily: { "2026-10-14": { sum: 8432, count: 12 } } },
    SleepAsleep: { unit: "min", policy: "duration", daily: { "2026-10-14": { minutes: 432, count: 3 } } },
    HKQuantityTypeIdentifierRestingHeartRate: { unit: "count/min", policy: "measure", daily: { "2026-10-14": { min: 50, max: 58, avg: 54.26, count: 2 } } },
  },
};

describe("dailyValues", () => {
  it("liest je Feld den passenden Tages-Eimer; Schlaf in Stunden, eine Nachkommastelle", () => {
    expect(dailyValues(cache, "2026-10-14")).toEqual({ health_steps: 8432, health_sleep_h: 7.2, health_resting_hr: 54.3 });
  });
  it("Tag ohne Daten → leer, kein Feld mit erfundener 0", () => {
    expect(dailyValues(cache, "2026-10-15")).toEqual({});
  });
  it("jedes Feld trägt den Präfix health_ (kein Zusammenstoß mit Nutzer-Properties)", () => {
    for (const f of DAILY_FIELDS) expect(f.key.startsWith("health_")).toBe(true);
  });
});
