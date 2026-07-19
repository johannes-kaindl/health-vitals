import { Aggregator } from "../../src/core/aggregator";
import type { HealthEvent } from "../../src/core/health-parser";
import type { SumBucket, MeasureBucket, DurationBucket } from "../../src/core/types";

const META = { sourceFile: "x.zip", importedAt: "2026-07-19T00:00:00.000Z" };

function rec(type: string, value: number | null, start: string, end = start, unit = "u"): HealthEvent {
  return { kind: "record", type, unit, startDate: start, endDate: end, value };
}

describe("Aggregator", () => {
  it("sum: addiert value pro Tag, zählt count", () => {
    const agg = new Aggregator();
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 214, "2022-11-25 08:39:02 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 86, "2022-11-25 09:10:00 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 500, "2022-11-26 07:00:00 +0200"));
    const cache = agg.finalize(META);
    const daily = cache.metrics["HKQuantityTypeIdentifierStepCount"].daily;
    expect(daily["2022-11-25"] as SumBucket).toEqual({ sum: 300, count: 2 });
    expect(daily["2022-11-26"] as SumBucket).toEqual({ sum: 500, count: 1 });
  });

  it("measure: min/max/avg/count", () => {
    const agg = new Aggregator();
    agg.add(rec("HKQuantityTypeIdentifierHeartRate", 60, "2022-11-25 08:40:00 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierHeartRate", 90, "2022-11-25 20:00:00 +0200"));
    const b = agg.finalize(META).metrics["HKQuantityTypeIdentifierHeartRate"].daily["2022-11-25"] as MeasureBucket;
    expect(b).toEqual({ min: 60, max: 90, avg: 75, count: 2 });
  });

  it("duration: summiert Intervall-Minuten (value darf null sein)", () => {
    const agg = new Aggregator();
    agg.add(rec("HKCategoryTypeIdentifierSleepAnalysis", null, "2022-11-25 23:30:00 +0200", "2022-11-26 00:30:00 +0200"));
    const b = agg.finalize(META).metrics["HKCategoryTypeIdentifierSleepAnalysis"].daily["2022-11-25"] as DurationBucket;
    expect(b).toEqual({ minutes: 60, count: 1 });
  });

  it("skippt sum/measure ohne value, ohne den Tagesbereich zu berühren", () => {
    const agg = new Aggregator();
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 500, "2022-11-26 07:00:00 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierStepCount", null, "2022-11-27 07:00:00 +0200"));
    const cache = agg.finalize(META);
    expect(cache.recordCount).toBe(1);
    expect(cache.skippedCount).toBe(1);
    expect(cache.dateRange).toEqual({ from: "2022-11-26", to: "2022-11-26" });
  });

  it("sammelt Workouts und setzt unit aus erster Beobachtung", () => {
    const agg = new Aggregator();
    agg.add({ kind: "workout", activityType: "HKWorkoutActivityTypeX", startDate: "2022-11-25 18:00:00 +0200", endDate: "2022-11-25 18:30:30 +0200", duration: 30.5 });
    const cache = agg.finalize(META);
    expect(cache.workouts).toEqual([{ type: "HKWorkoutActivityTypeX", start: "2022-11-25T18:00", durationMin: 30.5 }]);
  });
});
