import { TFile } from "obsidian";
import { dailyNotePath, readDailyNotesConfig, writeDailyValues } from "../../src/obsidian/daily-note";
import type { HealthCache } from "../../src/core/types";

const cache: HealthCache = {
  version: 4, sourceFile: "", importedAt: "", recordCount: 0, skippedCount: 0, dateRange: null, workouts: [],
  metrics: { HKQuantityTypeIdentifierStepCount: { unit: "count", policy: "sum", daily: { "2026-10-14": { sum: 8432, count: 1 } } } },
};
// Mittag Ortszeit: derselbe Kalendertag in jeder Zone.
const NOW = new Date(2026, 9, 14, 12, 0, 0);

function makeApp(opts: { options?: any; notePath?: string; fm?: Record<string, unknown> } = {}): any {
  const file = Object.assign(new (TFile as any)(), { path: opts.notePath ?? "Daily/2026-10-14.md" });
  const fm = opts.fm ?? {};
  return {
    internalPlugins: { getPluginById: () => (opts.options === undefined ? null : { instance: { options: opts.options } }) },
    vault: { getAbstractFileByPath: (p: string) => (p === file.path ? file : null) },
    fileManager: { processFrontMatter: async (_f: any, cb: (m: any) => void) => { cb(fm); } },
    fm,
  };
}

describe("Daily-Note-Pfad", () => {
  it("liest Ordner und Format des Kern-Plugins", () => {
    expect(readDailyNotesConfig(makeApp({ options: { folder: " Daily ", format: "YYYY-MM-DD" } }))).toEqual({ folder: "Daily", format: "YYYY-MM-DD" });
  });
  it("ohne Kern-Plugin: Vault-Wurzel und YYYY-MM-DD", () => {
    expect(readDailyNotesConfig(makeApp())).toEqual({ folder: "", format: "YYYY-MM-DD" });
  });
  it("baut den Pfad aus Format und Ordner", () => {
    expect(dailyNotePath({ folder: "Daily", format: "YYYY-MM-DD" }, NOW)).toBe("Daily/2026-10-14.md");
    expect(dailyNotePath({ folder: "", format: "YYYY-MM-DD" }, NOW)).toBe("2026-10-14.md");
  });
});

describe("writeDailyValues", () => {
  it("schreibt fehlende Felder in die vorhandene Notiz", async () => {
    const app = makeApp({ options: { folder: "Daily", format: "YYYY-MM-DD" }, fm: { mood: "gut" } });
    expect(await writeDailyValues(app, cache, NOW)).toEqual({ status: "written", path: "Daily/2026-10-14.md", keys: ["health_steps"] });
    expect(app.fm).toEqual({ mood: "gut", health_steps: 8432 });
  });
  it("vorhandene Werte bleiben stehen — auch leere und 0 —, fremde Felder bleiben unberührt", async () => {
    const app = makeApp({ options: { folder: "Daily", format: "YYYY-MM-DD" }, fm: { health_steps: 0, a: 1 } });
    expect((await writeDailyValues(app, cache, NOW)).status).toBe("nothing-new");
    expect(app.fm).toEqual({ health_steps: 0, a: 1 });
  });
  it("vorhandener Wert bleibt, nichts Neues → nothing-new", async () => {
    const app = makeApp({ options: { folder: "Daily", format: "YYYY-MM-DD" }, fm: { health_steps: 100 } });
    expect((await writeDailyValues(app, cache, NOW)).status).toBe("nothing-new");
    expect(app.fm.health_steps).toBe(100);
  });
  it("keine Notiz: wird nicht angelegt", async () => {
    const app = makeApp({ options: { folder: "Anders", format: "YYYY-MM-DD" } });
    expect(await writeDailyValues(app, cache, NOW)).toEqual({ status: "no-note", path: "Anders/2026-10-14.md" });
  });
  it("keine Werte für heute: weder Pfad noch Schreibzugriff", async () => {
    const app = makeApp({ options: { folder: "Daily", format: "YYYY-MM-DD" } });
    expect(await writeDailyValues(app, cache, new Date(2026, 9, 15, 12))).toEqual({ status: "no-values", day: "2026-10-15" });
  });
});
