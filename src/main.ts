import { Plugin, WorkspaceLeaf, normalizePath, getLanguage } from "obsidian";
import type { HealthCache } from "./core/types";
import type { ImportState } from "./core/import-state";
import { ImportController } from "./obsidian/import-controller";
import { pickHealthExport } from "./obsidian/file-picker";
import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "./obsidian/dashboard-view";
import { pickLang, setLang } from "./vendor/kit/i18n";
import { t, registerI18n } from "./i18n/strings";

const CACHE_FILE = "health-cache.json";

interface PluginData { favorites: string[]; }
const DEFAULT_DATA: PluginData = { favorites: [] };

export default class AppleHealthPlugin extends Plugin implements DashboardHost {
  private data: PluginData = { ...DEFAULT_DATA };

  async onload(): Promise<void> {
    await this.loadPluginData();

    setLang(pickLang(safeGetLanguage()));
    registerI18n();

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

    this.addCommand({
      id: "open-dashboard",
      name: t("cmd.openDashboard"),
      callback: () => { void this.activateView(); },
    });
    this.addRibbonIcon("heart-pulse", t("ribbon.tooltip"), () => { void this.activateView(); });
  }

  onunload(): void {}

  // --- Persistence ---
  async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    this.data = { ...DEFAULT_DATA, ...(loaded ?? {}) };
  }

  /**
   * Pfad des Caches im eigenen Plugin-Ordner. `manifest.dir` ist der von Obsidian
   * selbst ermittelte, vault-relative Pfad zum tatsächlichen Plugin-Ordner — der
   * fällt bei manuellen Installationen (git clone in einen anders benannten Ordner,
   * manche BRAT-Setups) nicht zwangsläufig mit `plugins/${manifest.id}` zusammen.
   * Der Fallback greift nur, falls `manifest.dir` einmal fehlen sollte, und baut über
   * vault.configDir statt eines hartkodierten ".obsidian/..." (obsidianmd/hardcoded-config-path).
   */
  private cachePath(): string {
    const dir = this.manifest.dir ?? `${this.app.vault.configDir}/plugins/${this.manifest.id}`;
    return normalizePath(`${dir}/${CACHE_FILE}`);
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
    try {
      const raw = await this.app.vault.adapter.read(this.cachePath());
      return JSON.parse(raw) as HealthCache;
    } catch {
      return null;
    }
  }

  async writeCache(cache: HealthCache): Promise<void> {
    await this.app.vault.adapter.write(this.cachePath(), JSON.stringify(cache));
  }

  createImportController(onState: (s: ImportState) => void): ImportController {
    // Kein zusätzliches Notice bei "failed": Der Fehler erscheint bereits im
    // Import-Screen selbst — die Spec verlangt ausdrücklich "nicht als wegklickbare
    // Notice". Fix 3 (onClose bricht den Import ab) macht das frühere Argument, die
    // View könnte beim Fehlschlag bereits geschlossen sein, weitgehend hinfällig.
    return new ImportController(this, onState);
  }

  pickExport(): Promise<File | null> {
    return pickHealthExport(activeDocument);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}

function safeGetLanguage(): string | null {
  try { return getLanguage(); } catch { return null; }
}
