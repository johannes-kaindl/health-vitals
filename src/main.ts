import { Plugin, WorkspaceLeaf, Notice, normalizePath, getLanguage } from "obsidian";
import type { HealthCache } from "./core/types";
import { METRIC_SLEEP_ASLEEP } from "./core/sleep-session";
import type { ImportState } from "./core/import-state";
import { ImportController } from "./obsidian/import-controller";
import { pickHealthExport } from "./obsidian/file-picker";
import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost, type ExportFormat } from "./obsidian/dashboard-view";
import { pickLang, setLang } from "./vendor/kit/i18n";
import { t, registerI18n } from "./i18n/strings";

const CACHE_FILE = "health-cache.json";
/** Muss mit `HealthCache["version"]` übereinstimmen — ältere Caches werden verworfen. */
const CACHE_VERSION = 2;

interface PluginData {
  favorites: string[];
  exportFolder: string;
  exportFormat: ExportFormat;
  collapsed: Record<string, boolean>;
}
const DEFAULT_DATA: PluginData = {
  favorites: [], exportFolder: "", exportFormat: "md", collapsed: {},
};

// Frische Kopie von DEFAULT_DATA statt der Modul-Vorlage selbst: `favorites`/`collapsed`
// sind Objekte/Arrays — ein flacher Spread von DEFAULT_DATA würde deren REFERENZ teilen,
// und `toggleFavorite`/`setCollapsed` mutieren in place. Ohne diese Kopie würde die erste
// Plugin-Instanz im Prozess (Dev-Hot-Reload, Deaktivieren/Aktivieren ohne Neustart) die
// Modul-Vorlage selbst verunreinigen — jede spätere Instanz sähe dann keine echten Defaults
// mehr, sondern den Endzustand der vorherigen.
function freshDefaultData(): PluginData {
  return { ...DEFAULT_DATA, favorites: [...DEFAULT_DATA.favorites], collapsed: { ...DEFAULT_DATA.collapsed } };
}

/**
 * Der Schlaf-Favorit zeigte auf den Apple-Identifier, den es seit Cache-Version 2
 * nicht mehr gibt. Ohne Umschreiben verschwände die Kachel wortlos, und der Stern
 * ließe sich nicht einmal neu setzen — die alte ID taucht in keiner Liste mehr auf.
 * Ziel ist `SleepAsleep`: Wer „Schlaf" favorisiert hat, meinte die geschlafene Zeit,
 * nicht die Zeit im Bett.
 */
function migrateFavorites(favorites: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of favorites) {
    const mapped = id === "HKCategoryTypeIdentifierSleepAnalysis" ? METRIC_SLEEP_ASLEEP : id;
    if (!out.includes(mapped)) out.push(mapped);
  }
  return out;
}

/** `typeof null === "object"` — die Null-Prüfung ist der eigentliche Punkt hier. */
function isPlainObject(v: unknown): v is Record<string, boolean> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export default class AppleHealthPlugin extends Plugin implements DashboardHost {
  private data: PluginData = freshDefaultData();

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
    // freshDefaultData() statt DEFAULT_DATA direkt spreaden — sonst übernehmen fehlende
    // Felder (jedes alte data.json, oder loadData() === null beim allerersten Start) die
    // geteilte Referenz auf die Modul-Vorlage statt eine eigene Kopie (siehe Kommentar dort).
    //
    // Jedes Feld einzeln auf seinen Typ prüfen, statt `loaded` pauschal darüberzuspreaden:
    // data.json ist eine Datei im Vault des Nutzers und kann von Hand editiert oder von
    // einem Sync-Konflikt zerlegt worden sein. Ein `"favorites": null` darin überschriebe
    // beim Spread den Default und ließe getFavorites() null liefern — die Übersicht ruft
    // darauf .indexOf() und stirbt beim Öffnen des Dashboards.
    const base = freshDefaultData();
    const fmt = loaded?.exportFormat;
    this.data = {
      favorites: Array.isArray(loaded?.favorites) ? migrateFavorites(loaded.favorites) : base.favorites,
      exportFolder: typeof loaded?.exportFolder === "string" ? loaded.exportFolder : base.exportFolder,
      exportFormat: fmt === "md" || fmt === "csv" ? fmt : base.exportFormat,
      collapsed: isPlainObject(loaded?.collapsed) ? { ...loaded.collapsed } : base.collapsed,
    };
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

  getExportFolder(): string { return this.data.exportFolder; }
  setExportFolder(v: string): void {
    this.data.exportFolder = v;
    void this.saveData(this.data);
  }

  getExportFormat(): ExportFormat { return this.data.exportFormat; }
  setExportFormat(f: ExportFormat): void {
    this.data.exportFormat = f;
    void this.saveData(this.data);
  }

  // Signatur von CollapsibleStorage vorgegeben: synchron, kein Promise. Das
  // Schreiben läuft deshalb bewusst als void-Aufruf nebenher — geht es schief,
  // ist die Folge ein nicht gemerkter Aufklappzustand, kein Datenverlust.
  getCollapsed(key: string): boolean | undefined { return this.data.collapsed[key]; }
  setCollapsed(key: string, collapsed: boolean): void {
    this.data.collapsed[key] = collapsed;
    void this.saveData(this.data);
  }

  async loadCache(): Promise<HealthCache | null> {
    try {
      const raw = await this.app.vault.adapter.read(this.cachePath());
      const cache = JSON.parse(raw) as HealthCache;
      // Ein Cache der Version 1 enthält aufaddierte Schlafzeiten (bis zu 33,6 h am
      // Tag). Umrechnen geht nicht: Die Unterscheidung zwischen Liegezeit und Phase
      // wurde beim Import weggeworfen. Also verwerfen und neu einlesen lassen —
      // stillschweigend weiterzuverwenden hieße, den Fehler zu konservieren.
      if (cache?.version !== CACHE_VERSION) {
        // Sichtbar machen: Ohne Hinweis stünde der Nutzer vor einem leeren Dashboard
        // und hielte das für Datenverlust statt für eine nötige Neuberechnung.
        new Notice(t("notice.cacheOutdated"), 10000);
        return null;
      }
      return cache;
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
