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

  it("Sektionen tragen neutrale Kategorie-Keys + lokalisiertes Label", () => {
    const vm = buildOverviewVM(cache(), [], { width: 60, height: 24, padding: 2 });
    const activity = vm.sections.find((s) => s.category === "activity");
    expect(activity).toBeDefined();
    expect(activity!.categoryLabel).toBe("Aktivität"); // de aus globalem Setup
    const body = vm.sections.find((s) => s.category === "body");
    expect(body!.categoryLabel).toBe("Körper");
  });

  it("ein Favoriten-Wechsel rechnet keine Kachel neu", () => {
    // Der Grund für die Memo: Favoriten entscheiden nur, in welchen Topf eine Kachel
    // fällt. Identische Objektreferenz = die teure Aufrollung lief nicht erneut.
    const c = cache();
    const before = buildOverviewVM(c, [], dims);
    const steps = before.sections.flatMap((s) => s.tiles).find((t) => t.id.endsWith("StepCount"));
    const after = buildOverviewVM(c, ["HKQuantityTypeIdentifierStepCount"], dims);
    expect(after.favorites[0]).toBe(steps);
  });

  it("ein neuer Cache erzeugt frische Kacheln", () => {
    // Nach einem Import ist der Cache ein neues Objekt — sonst zeigte die Übersicht
    // weiter die Zahlen von vorher.
    const first = buildOverviewVM(cache(), [], dims);
    const second = buildOverviewVM(cache(), [], dims);
    expect(second.sections[0].tiles[0]).not.toBe(first.sections[0].tiles[0]);
    expect(second.sections[0].tiles[0]).toEqual(first.sections[0].tiles[0]);
  });

  it("andere Sparkline-Maße liefern eigene Geometrie", () => {
    const c = cache();
    const small = buildOverviewVM(c, [], { width: 60, height: 24, padding: 2 });
    const large = buildOverviewVM(c, [], dims);
    expect(large.sections[0].tiles[0].spark).not.toEqual(small.sections[0].tiles[0].spark);
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

  it("empty=true bei unbekannter Metrik, sonst false", () => {
    const vm = buildDetailVM(cache(), "HKQuantityTypeIdentifierStepCount", "1M", dims);
    // Range 1M endet 2026-01-31, from 2025-12-31 → Daten liegen drin → nicht empty.
    // Unbekannte Metrik hingegen → empty:
    const none = buildDetailVM(cache(), "HKQuantityTypeIdentifierUnknownXYZ", "all", dims);
    expect(none.empty).toBe(true);
    expect(vm.empty).toBe(false);
  });

  it("empty=true bei fehlendem dateRange", () => {
    const vm = buildDetailVM({ ...cache(), dateRange: null }, "HKQuantityTypeIdentifierStepCount", "all", dims);
    expect(vm.empty).toBe(true);
  });
});

describe("buildDetailVM — Achse und Tabelle", () => {
  const dims = { width: 640, height: 260, padding: 24 };

  const measureCache: HealthCache = {
    version: 1, sourceFile: "", importedAt: "", recordCount: 3, skippedCount: 0,
    dateRange: { from: "2026-07-27", to: "2026-07-29" },
    metrics: {
      HKQuantityTypeIdentifierRestingHeartRate: {
        unit: "bpm", policy: "measure",
        daily: {
          "2026-07-27": { min: 50, max: 90, avg: 60, count: 2 },
          "2026-07-28": { min: 55, max: 95, avg: 72.3456, count: 2 },
        },
      },
    },
    workouts: [],
  };

  const sumCache: HealthCache = {
    version: 1, sourceFile: "", importedAt: "", recordCount: 1, skippedCount: 0,
    dateRange: { from: "2026-07-27", to: "2026-07-28" },
    metrics: {
      HKQuantityTypeIdentifierStepCount: {
        unit: "count", policy: "sum",
        daily: { "2026-07-28": { sum: 8000, count: 1 } },
      },
    },
    workouts: [],
  };

  it("measure: vier Spalten, Einheit im Kopf statt in den Zellen", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    expect(vm.table.headers).toHaveLength(4);
    expect(vm.table.headers[1]).toContain("bpm");
    // Keine Zelle trägt die Einheit
    for (const row of vm.table.rows) {
      for (const cell of row) expect(cell).not.toContain("bpm");
    }
  });

  it("sum: zwei Spalten", () => {
    const vm = buildDetailVM(sumCache, "HKQuantityTypeIdentifierStepCount", "1M", dims);
    expect(vm.table.headers).toHaveLength(2);
    expect(vm.table.rows[0]).toHaveLength(2);
  });

  it("erste Spalte trägt den rohen Schlüssel, nicht das Achsenformat", () => {
    const vm = buildDetailVM(sumCache, "HKQuantityTypeIdentifierStepCount", "1M", dims);
    expect(vm.table.rows[0][0]).toBe("2026-07-28");
  });

  it("rows sind locale-formatiert, rowsRaw tragen Punkt-Dezimalzahlen", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    const i = vm.table.rows.findIndex((r) => r[0] === "2026-07-28");
    expect(vm.table.rows[i][1]).toBe("72,3");    // de-DE, gerundet wie formatValue
    expect(vm.table.rowsRaw[i][1]).toBe("72.346"); // roh, Punkt, 3 Nachkommastellen
  });

  it("Achse: x-Labels tragen Prozentpositionen zwischen 0 und 100", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    expect(vm.axis.x.length).toBeGreaterThan(0);
    for (const tick of vm.axis.x) {
      expect(tick.leftPct).toBeGreaterThanOrEqual(0);
      expect(tick.leftPct).toBeLessThanOrEqual(100);
      expect(tick.label).toBeTruthy();
    }
  });

  it("Achse: drei y-Labels ohne Einheit", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    expect(vm.axis.y).toHaveLength(3);
    for (const tick of vm.axis.y) expect(tick.label).not.toContain("bpm");
  });

  it("unbekannte Metrik → leere Achse und leere Tabelle statt Absturz", () => {
    const vm = buildDetailVM(measureCache, "GibtsNicht", "1M", dims);
    expect(vm.empty).toBe(true);
    expect(vm.axis.x).toEqual([]);
    expect(vm.axis.y).toEqual([]);
    expect(vm.table.rows).toEqual([]);
  });
});
