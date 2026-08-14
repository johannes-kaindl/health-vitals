import { buildSleepStagesVM } from "../../src/core/view-model";
import { setLang } from "../../src/i18n/strings";
import type { HealthCache, SleepStageDay } from "../../src/core/types";

const DIMS = { width: 640, height: 260, padding: 24 };

function night(p: Partial<SleepStageDay>): SleepStageDay {
  return { core: 0, deep: 0, rem: 0, unspecified: 0, awake: 0, ...p };
}

function cacheWith(stages: Record<string, SleepStageDay>, from: string, to: string): HealthCache {
  return {
    version: 2, sourceFile: "x", importedAt: "2026-01-01T00:00", recordCount: 0, skippedCount: 0,
    dateRange: { from, to }, metrics: {}, workouts: [], sleepStages: stages,
  };
}

beforeEach(() => setLang("en"));

describe("buildSleepStagesVM", () => {
  it("baut Chart, Legende und Achse aus den Phasen des Zeitraums", () => {
    const cache = cacheWith({
      "2026-01-20": night({ deep: 60, core: 240, rem: 60 }),
    }, "2026-01-01", "2026-01-31");

    const vm = buildSleepStagesVM(cache, "1M", DIMS);

    expect(vm.empty).toBe(false);
    expect(vm.chart.stacks).toHaveLength(1);
    // Nur Phasen, die tatsächlich vorkommen, stehen in der Legende — eine Legende
    // mit vier Einträgen bei einfarbigem Chart behauptet Daten, die es nicht gibt.
    expect(vm.legend.map((l) => l.stage)).toEqual(["deep", "core", "rem"]);
    expect(vm.legend[0].label).toBe("Deep");
    // Die y-Achse ist eine Dauer, keine nackte Minutenzahl.
    expect(vm.axis.y[vm.axis.y.length - 1].label).toBe("6h 0m");
  });

  it("meldet leer, wenn der Cache gar keine Phasen trägt", () => {
    const cache = cacheWith({}, "2026-01-01", "2026-01-31");

    expect(buildSleepStagesVM(cache, "1M", DIMS).empty).toBe(true);
  });

  it("meldet leer, wenn das Feld sleepStages ganz fehlt (Cache ohne Schlaf)", () => {
    const cache = cacheWith({}, "2026-01-01", "2026-01-31");
    delete cache.sleepStages;

    expect(buildSleepStagesVM(cache, "1M", DIMS).empty).toBe(true);
  });
});

describe("buildSleepStagesVM — Hinweis auf unbestimmte Nächte", () => {
  it("nennt den Anteil, sobald unbestimmte Nächte überwiegen", () => {
    const cache = cacheWith({
      "2026-01-20": night({ unspecified: 400 }),
      "2026-01-21": night({ unspecified: 400 }),
      "2026-01-22": night({ deep: 60, core: 300 }),
    }, "2026-01-01", "2026-01-31");

    const vm = buildSleepStagesVM(cache, "1M", DIMS);

    expect(vm.note).toBe("In 67% of nights in this period the device recorded no sleep stages.");
  });

  it("schweigt, wenn die Mehrheit der Nächte aufgeschlüsselt ist", () => {
    const cache = cacheWith({
      "2026-01-20": night({ unspecified: 400 }),
      "2026-01-21": night({ deep: 60, core: 300 }),
      "2026-01-22": night({ deep: 60, core: 300 }),
    }, "2026-01-01", "2026-01-31");

    expect(buildSleepStagesVM(cache, "1M", DIMS).note).toBeNull();
  });
});

describe("buildSleepStagesVM — Wachzeit", () => {
  it("führt die Wachzeit als Kennzahl, nicht als Segment im Stapel", () => {
    const cache = cacheWith({
      "2026-01-20": night({ core: 300, awake: 60 }),
    }, "2026-01-01", "2026-01-31");

    const vm = buildSleepStagesVM(cache, "1M", DIMS);

    expect(vm.chart.stacks[0].segments.map((s) => s.stage)).toEqual(["core"]);
    expect(vm.stats).toEqual([{ label: "Avg awake", value: "1h 0m" }]);
  });
});
