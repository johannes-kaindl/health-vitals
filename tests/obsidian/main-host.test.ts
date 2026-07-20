import AppleHealthPlugin from "../../src/main";
import type { HealthCache } from "../../src/core/types";

describe("AppleHealthPlugin favorites host", () => {
  it("toggleFavorite fügt hinzu und entfernt, persistiert über saveData", async () => {
    const p = new AppleHealthPlugin({} as any, {} as any) as any;
    const saved: any[] = [];
    p.loadData = async () => ({ favorites: [] });
    p.saveData = async (d: any) => { saved.push(d); };
    await p.loadPluginData();
    expect(p.getFavorites()).toEqual([]);
    await p.toggleFavorite("HKQuantityTypeIdentifierStepCount");
    expect(p.getFavorites()).toEqual(["HKQuantityTypeIdentifierStepCount"]);
    await p.toggleFavorite("HKQuantityTypeIdentifierStepCount");
    expect(p.getFavorites()).toEqual([]);
    expect(saved.length).toBe(2);
  });
});

describe("AppleHealthPlugin cache I/O", () => {
  // Bewusst ein NICHT-default configDir: ".obsidian" wäre auch dann grün, wenn
  // jemand den Pfad wieder hartkodiert — genau das soll dieser Test verhindern
  // (obsidianmd/hardcoded-config-path).
  function makePlugin(configDir: string, adapter: any, dir?: string): any {
    const app = { vault: { configDir, adapter } };
    const manifest = { id: "apple-health", dir };
    return new AppleHealthPlugin(app as any, manifest as any) as any;
  }

  // Der Produktionsfall: Obsidian setzt manifest.dir für jede geladene Plugin-Instanz.
  // cachePath() muss ihn verwenden statt den Ordner aus configDir/plugins/id neu
  // zusammenzusetzen — die beiden fallen nur bei einer Standard-Store-Installation
  // zusammen (manueller Install/BRAT mit abweichendem Ordnernamen: schreibt sonst ins
  // Leere, siehe cachePath()-Kommentar).
  it("cachePath verwendet manifest.dir, wenn vorhanden (Produktionsfall)", () => {
    const p = makePlugin(".obsidian", {}, ".obsidian/plugins/anderer-ordnername");
    expect(p.cachePath()).toBe(".obsidian/plugins/anderer-ordnername/health-cache.json");
  });

  it("cachePath fällt auf vault.configDir und manifest.id zurück, wenn manifest.dir fehlt, nicht auf '.obsidian'", () => {
    const p = makePlugin(".my-config", {});
    expect(p.cachePath()).toBe(".my-config/plugins/apple-health/health-cache.json");
  });

  it("loadCache liefert null, wenn die Datei fehlt (Adapter-read lehnt ab)", async () => {
    const p = makePlugin(".obsidian", {
      read: async () => { throw new Error("ENOENT: no such file"); },
    });
    await expect(p.loadCache()).resolves.toBeNull();
  });

  it("writeCache schreibt den JSON-serialisierten Cache unter cachePath()", async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const p = makePlugin(".my-config", {
      write: async (path: string, data: string) => { writes.push({ path, data }); },
    });
    const cache: HealthCache = {
      version: 1,
      sourceFile: "export.zip",
      importedAt: "2026-07-20T00:00:00.000Z",
      recordCount: 1,
      skippedCount: 0,
      dateRange: null,
      metrics: {},
      workouts: [],
    };

    await p.writeCache(cache);

    expect(writes).toHaveLength(1);
    expect(writes[0].path).toBe(".my-config/plugins/apple-health/health-cache.json");
    expect(JSON.parse(writes[0].data)).toEqual(cache);
  });
});
