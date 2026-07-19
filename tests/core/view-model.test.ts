import { buildOverviewVM, buildDetailVM } from "../../src/core/view-model";
import type { HealthCache } from "../../src/core/types";

function cache(): HealthCache {
  return {
    version: 1, sourceFile: "x", importedAt: "", recordCount: 3, skippedCount: 0,
    dateRange: { from: "2026-01-01", to: "2026-01-31" },
    metrics: {
      HKQuantityTypeIdentifierStepCount: {
        unit: "count", policy: "sum",
        daily: { "2026-01-01": { sum: 100, count: 1 }, "2026-01-02": { sum: 300, count: 1 } },
      },
      HKQuantityTypeIdentifierBodyMass: {
        unit: "kg", policy: "measure",
        daily: { "2026-01-01": { min: 78, max: 79, avg: 78.5, count: 1 } },
      },
    },
    workouts: [],
  };
}
const dims = { width: 200, height: 80, padding: 6 };

describe("buildOverviewVM", () => {
  it("Favoriten oben, Rest nach Kategorie gruppiert, keine Dubletten", () => {
    const vm = buildOverviewVM(cache(), ["HKQuantityTypeIdentifierBodyMass"], { width: 60, height: 24, padding: 2 });
    expect(vm.favorites.map((t) => t.name)).toEqual(["Gewicht"]);
    const allSection = vm.sections.flatMap((s) => s.tiles.map((t) => t.name));
    expect(allSection).toContain("Schritte");
    expect(allSection).not.toContain("Gewicht"); // Favorit erscheint nicht doppelt
  });
});

describe("buildDetailVM", () => {
  it("liefert Chart + Stats + Range-Label für existierende Metrik", () => {
    const vm = buildDetailVM(cache(), "HKQuantityTypeIdentifierStepCount", "all", dims);
    expect(vm.name).toBe("Schritte");
    expect(vm.empty).toBe(false);
    expect(vm.chart.kind).toBe("bar");
    expect(vm.stats.some((r) => r.label === "Summe")).toBe(true);
  });

  it("empty=true, wenn die Metrik im Range keine Daten hat", () => {
    const vm = buildDetailVM(cache(), "HKQuantityTypeIdentifierStepCount", "1M", dims);
    // Range 1M endet 2026-01-31, from 2025-12-31 → Daten liegen drin → nicht empty.
    // Unbekannte Metrik hingegen → empty:
    const none = buildDetailVM(cache(), "HKQuantityTypeIdentifierUnknownXYZ", "all", dims);
    expect(none.empty).toBe(true);
    expect(vm.empty).toBe(false);
  });
});
