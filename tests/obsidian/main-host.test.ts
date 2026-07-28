import AppleHealthPlugin from "../../src/main";
import type { HealthCache } from "../../src/core/types";

function makePlugin(): any {
  return new AppleHealthPlugin({} as any, {} as any) as any;
}

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

describe("Export-Einstellungen im Plugin-Data", () => {
  it("Defaults: leerer Ordner, Markdown, nichts eingeklappt gespeichert", async () => {
    const plugin = makePlugin();           // vorhandener Helfer der Datei
    await plugin.loadPluginData();
    expect(plugin.getExportFolder()).toBe("");
    expect(plugin.getExportFormat()).toBe("md");
    expect(plugin.getCollapsed("detail-values")).toBeUndefined();
  });

  it("Setzen persistiert über saveData", async () => {
    const plugin = makePlugin();
    const saved: any[] = [];
    plugin.saveData = async (d: any) => { saved.push(d); };
    await plugin.loadPluginData();
    plugin.setExportFolder("30_Health");
    plugin.setExportFormat("csv");
    plugin.setCollapsed("detail-values", false);
    // Nicht nur den In-Memory-Zustand zurücklesen (das würde auch dann grün sein, wenn
    // saveData gar nicht aufgerufen würde) — sondern belegen, dass jeder Setter tatsächlich
    // mit den erwarteten Daten persistiert hat.
    expect(saved).toHaveLength(3);
    expect(saved[0]).toMatchObject({ exportFolder: "30_Health" });
    expect(saved[1]).toMatchObject({ exportFormat: "csv" });
    expect(saved[2]).toMatchObject({ collapsed: { "detail-values": false } });
  });

  it("Altes data.json ohne die neuen Felder lädt ohne Absturz", async () => {
    const plugin = makePlugin();
    plugin.loadData = async () => ({ favorites: ["a"] });
    await plugin.loadPluginData();
    expect(plugin.getFavorites()).toEqual(["a"]);
    expect(plugin.getExportFolder()).toBe("");
    expect(plugin.getExportFormat()).toBe("md");
  });

  it("zwei Instanzen ohne gespeicherte Felder teilen keine Default-Referenz (kein Cross-Instance-Leak)", async () => {
    // Regression: DEFAULT_DATA.collapsed/favorites sind Modul-Level-Objekte/Arrays. Ein
    // flacher Spread `{ ...DEFAULT_DATA, ...(loaded ?? {}) }` übernimmt bei fehlendem Feld
    // (jedes alte data.json, oder der allererste Start ohne data.json) die REFERENZ auf die
    // Default-Vorlage statt eine Kopie — nachfolgende Mutationen (setCollapsed, toggleFavorite)
    // verunreinigen dann DEFAULT_DATA selbst und damit jede später im selben Prozess
    // erzeugte Plugin-Instanz (Dev-Hot-Reload, Deaktivieren/Aktivieren ohne Neustart).
    const first = makePlugin();
    await first.loadPluginData(); // loadData() liefert null → nichts geladen, reiner Default-Pfad
    first.setCollapsed("detail-values", true);
    await first.toggleFavorite("HKQuantityTypeIdentifierStepCount");

    const second = makePlugin();
    await second.loadPluginData();
    expect(second.getCollapsed("detail-values")).toBeUndefined();
    expect(second.getFavorites()).toEqual([]);
  });
});
