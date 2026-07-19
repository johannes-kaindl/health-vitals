import { resolveRange, rollupDaily } from "../../src/core/rollup";
import type { DayBucket } from "../../src/core/types";

describe("resolveRange", () => {
  const dr = { from: "2017-07-08", to: "2026-07-18" };
  it("1M/3M → Tage, anchored an dateRange.to", () => {
    expect(resolveRange("1M", dr)).toEqual({ from: "2026-06-18", to: "2026-07-18", granularity: "day" });
    expect(resolveRange("3M", dr).granularity).toBe("day");
  });
  it("1J → Wochen, all → Monate über den vollen Bereich", () => {
    expect(resolveRange("1J", dr)).toEqual({ from: "2025-07-18", to: "2026-07-18", granularity: "week" });
    expect(resolveRange("all", dr)).toEqual({ from: "2017-07-08", to: "2026-07-18", granularity: "month" });
  });
  it("klemmt den Tag am Monatsende (kein Überlauf)", () => {
    // 2026-03-31 minus 1 Monat: Februar 2026 hat 28 Tage → 2026-02-28, NICHT 2026-03-03
    expect(resolveRange("1M", { from: "2000-01-01", to: "2026-03-31" }).from).toBe("2026-02-28");
    // minus 12 Monate bleibt tag-gültig (März hat 31 Tage)
    expect(resolveRange("1J", { from: "2000-01-01", to: "2026-03-31" }).from).toBe("2025-03-31");
  });
});

describe("rollupDaily", () => {
  it("sum: summiert je Bucket, filtert auf Range, sortiert", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { sum: 10, count: 1 },
      "2026-01-15": { sum: 5, count: 1 },
      "2025-12-31": { sum: 99, count: 1 }, // außerhalb Range
    };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };
    expect(rollupDaily(daily, "sum", r)).toEqual([{ key: "2026-01", value: 15 }]);
  });

  it("measure: count-gewichteter Ø, min/max propagiert", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { min: 50, max: 70, avg: 60, count: 2 },
      "2026-01-02": { min: 40, max: 80, avg: 60, count: 8 },
    };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };
    const [pt] = rollupDaily(daily, "measure", r);
    expect(pt.key).toBe("2026-01");
    expect(pt.value).toBe(60); // (60*2 + 60*8)/10
    expect(pt.min).toBe(40);
    expect(pt.max).toBe(80);
  });

  it("week: ISO-Woche über Monatsgrenze bündelt korrekt", () => {
    // 2025-12-29 (Mo) .. 2026-01-04 (So) = ISO-Woche 2026-W01
    const daily: Record<string, DayBucket> = {
      "2025-12-29": { sum: 1, count: 1 },
      "2026-01-04": { sum: 2, count: 1 },
    };
    const r = { from: "2025-12-01", to: "2026-01-31", granularity: "week" as const };
    const pts = rollupDaily(daily, "sum", r);
    expect(pts).toEqual([{ key: "2026-W01", value: 3 }]);
  });

  it("duration: summiert Minuten je Tag-Bucket", () => {
    const daily: Record<string, DayBucket> = { "2026-01-01": { minutes: 420, count: 3 } };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "day" as const };
    expect(rollupDaily(daily, "duration", r)).toEqual([{ key: "2026-01-01", value: 420 }]);
  });
});
