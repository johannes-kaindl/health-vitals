import { parseBlockSpec, resolveMetricId } from "../../src/core/block-spec";
import type { HealthCache } from "../../src/core/types";

describe("parseBlockSpec", () => {
  it("liest metric, range, rollup, kind; Standard 3M und chart", () => {
    expect(parseBlockSpec("metric: StepCount\nrange: 1Y\nrollup: month\nkind: table").spec)
      .toEqual({ metric: "StepCount", range: "1Y", rollup: "month", kind: "table" });
    expect(parseBlockSpec("metric: StepCount").spec)
      .toEqual({ metric: "StepCount", range: "3M", rollup: undefined, kind: "chart" });
  });
  it("Groß-/Kleinschreibung, Anführungszeichen, Leer- und #-Zeilen", () => {
    const r = parseBlockSpec('# Notiz\n\nMetric: "HeartRate"\nRANGE: all');
    expect(r.spec).toMatchObject({ metric: "HeartRate", range: "all" });
    expect(r.errors).toEqual([]);
  });
  it("ohne metric: Fehler, kein Spec", () => {
    const r = parseBlockSpec("range: 1M");
    expect(r.spec).toBeNull();
    expect(r.errors).toEqual([{ key: "block.noMetric", args: [] }]);
  });
  it("ein Wert, den es nicht gibt, blockiert (kein stiller Standard)", () => {
    expect(parseBlockSpec("metric: X\nrange: 2W").errors).toEqual([{ key: "block.badRange", args: ["2W"] }]);
    expect(parseBlockSpec("metric: X\nrollup: hour").errors).toEqual([{ key: "block.badRollup", args: ["hour"] }]);
    expect(parseBlockSpec("metric: X\nkind: pie").errors).toEqual([{ key: "block.badKind", args: ["pie"] }]);
    expect(parseBlockSpec("metric: X\nrange: 2W").spec).toBeNull();
  });
  it("eine Zeile ohne Doppelpunkt ist ein Fehler, ein unbekannter Schlüssel nur eine Warnung", () => {
    expect(parseBlockSpec("StepCount").errors[0]).toEqual({ key: "block.badLine", args: ["StepCount"] });
    const r = parseBlockSpec("metric: X\ncolour: red");
    expect(r.spec).not.toBeNull();
    expect(r.warnings).toEqual([{ key: "block.unknownKey", args: ["colour"] }]);
  });
});

describe("resolveMetricId", () => {
  const cache = { metrics: {
    HKQuantityTypeIdentifierStepCount: {}, HKCategoryTypeIdentifierMindfulSession: {}, SleepAsleep: {},
  } } as unknown as HealthCache;
  it("Kurzform und voller Identifier, ohne Rücksicht auf Groß-/Kleinschreibung", () => {
    expect(resolveMetricId(cache, "StepCount")).toBe("HKQuantityTypeIdentifierStepCount");
    expect(resolveMetricId(cache, "stepcount")).toBe("HKQuantityTypeIdentifierStepCount");
    expect(resolveMetricId(cache, "HKQuantityTypeIdentifierStepCount")).toBe("HKQuantityTypeIdentifierStepCount");
    expect(resolveMetricId(cache, "MindfulSession")).toBe("HKCategoryTypeIdentifierMindfulSession");
    expect(resolveMetricId(cache, "SleepAsleep")).toBe("SleepAsleep");
  });
  it("unbekannt → null", () => {
    expect(resolveMetricId(cache, "Nope")).toBeNull();
  });
});
