import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { aggregateStream } from "../../src/core/pipeline";
import type { MeasureBucket, SumBucket, DurationBucket } from "../../src/core/types";

const XML = readFileSync(fileURLToPath(new URL("../fixtures/mini-export.xml", import.meta.url)), "utf8");
const META = { sourceFile: "mini-export.xml", importedAt: "2026-07-19T00:00:00.000Z" };

// Zerlegt den String in n-Zeichen-Chunks als Iterable.
function* chunked(s: string, size: number): Iterable<string> {
  for (let i = 0; i < s.length; i += size) yield s.slice(i, i + size);
}

describe("aggregateStream (Fixture, end-to-end)", () => {
  it("aggregiert korrekt — unabhängig von der Chunk-Größe", async () => {
    for (const size of [XML.length, 1, 4, 17, 64]) {
      const cache = await aggregateStream(chunked(XML, size), META);
      const step = cache.metrics["HKQuantityTypeIdentifierStepCount"].daily;
      expect(step["2022-11-25"] as SumBucket).toEqual({ sum: 300, count: 2 });
      expect(step["2022-11-26"] as SumBucket).toEqual({ sum: 500, count: 1 });
      expect(step["2022-11-27"]).toBeUndefined(); // ohne value → skipped

      const hr = cache.metrics["HKQuantityTypeIdentifierHeartRate"].daily["2022-11-25"] as MeasureBucket;
      expect(hr).toEqual({ min: 60, max: 90, avg: 75, count: 2 });

      const sleep = cache.metrics["HKCategoryTypeIdentifierSleepAnalysis"].daily["2022-11-25"] as DurationBucket;
      expect(sleep).toEqual({ minutes: 60, count: 1 });

      expect(cache.recordCount).toBe(7);
      expect(cache.skippedCount).toBe(1);
      expect(cache.dateRange).toEqual({ from: "2022-11-25", to: "2022-11-26" });
      expect(cache.workouts).toEqual([
        { type: "HKWorkoutActivityTypeTraditionalStrengthTraining", start: "2022-11-25T18:00", durationMin: 30.5 },
      ]);
    }
  });
});
