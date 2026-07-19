import { FileSystemAdapter, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { join } from "node:path";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { aggregateStream } from "./core/pipeline";
import type { HealthCache } from "./core/types";
import { openImportSource, pickImportFile } from "./obsidian/health-source";
import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "./obsidian/dashboard-view";

const CACHE_FILE = "health-cache.json";

interface PluginData { favorites: string[]; }
const DEFAULT_DATA: PluginData = { favorites: [] };

export default class AppleHealthPlugin extends Plugin implements DashboardHost {
  private data: PluginData = { ...DEFAULT_DATA };

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

    this.addCommand({ id: "import", name: "Import ausführen", callback: () => { void this.runImport(); } });
    this.addCommand({ id: "open-dashboard", name: "Dashboard öffnen", callback: () => { void this.activateView(); } });
    this.addRibbonIcon("heart-pulse", "Apple Health Dashboard", () => { void this.activateView(); });
  }

  onunload(): void {}

  // --- Persistence ---
  async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    this.data = { ...DEFAULT_DATA, ...(loaded ?? {}) };
  }

  // --- DashboardHost ---
  getFavorites(): string[] { return this.data.favorites; }

  async toggleFavorite(id: string): Promise<void> {
    const i = this.data.favorites.indexOf(id);
    if (i >= 0) this.data.favorites.splice(i, 1);
    else this.data.favorites.push(id);
    await this.saveData(this.data);
  }

  async loadCache(): Promise<HealthCache | null> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return null;
    const path = join(adapter.getBasePath(), this.manifest.dir ?? "", CACHE_FILE);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as HealthCache;
    } catch {
      return null;
    }
  }

  runImport(): void { void this.runImportInternal(); }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  private async runImportInternal(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice("Apple Health: nur auf dem Desktop verfügbar.");
      return;
    }
    const pluginDir = join(adapter.getBasePath(), this.manifest.dir ?? "");
    const importDir = join(pluginDir, "import");

    let names: string[];
    try { names = await readdir(importDir); }
    catch { new Notice("Apple Health: Ordner 'import/' nicht gefunden."); return; }

    const file = pickImportFile(names);
    if (!file) { new Notice("Apple Health: keine .zip/.xml in 'import/' gefunden."); return; }

    new Notice(`Apple Health: Import von ${file} gestartet …`);
    try {
      const cache = await aggregateStream(
        openImportSource(join(importDir, file)),
        { sourceFile: file, importedAt: new Date().toISOString() },
        (records) => new Notice(`Apple Health: ${records.toLocaleString()} Records …`),
      );
      await writeFile(join(pluginDir, CACHE_FILE), JSON.stringify(cache), "utf8");
      const types = Object.keys(cache.metrics).length;
      const range = cache.dateRange ? `${cache.dateRange.from}–${cache.dateRange.to}` : "—";
      new Notice(
        `Apple Health: fertig ✓ — ${cache.recordCount.toLocaleString()} Records · ${types} Metriken · ${cache.workouts.length} Workouts · Zeitraum ${range} (Klick schließt)`,
        0,
      );
    } catch (e) {
      new Notice(`Apple Health: Import fehlgeschlagen — ${e instanceof Error ? e.message : String(e)}`, 0);
    }
  }
}
