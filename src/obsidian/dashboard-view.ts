import { ItemView, WorkspaceLeaf } from "obsidian";
import { t } from "../vendor/kit/i18n";
import type { HealthCache } from "../core/types";
import { IDLE, type ImportState } from "../core/import-state";
import type { ImportController } from "./import-controller";
import { renderImport } from "./tabs/import";
import { renderOverview } from "./tabs/overview";
import { renderDetail, type DetailState } from "./tabs/detail";
import { renderWorkouts } from "./tabs/workouts";
import { buildHubInto, type HubController, type HubPanel } from "../vendor/kit-obsidian/hub";

export const VIEW_TYPE_DASHBOARD = "apple-health-dashboard";

export type ExportFormat = "md" | "csv";

export interface DashboardHost {
  loadCache(): Promise<HealthCache | null>;
  getFavorites(): string[];
  toggleFavorite(id: string): Promise<void>;
  createImportController(onState: (s: ImportState) => void): ImportController;
  pickExport(): Promise<File | null>;
  getExportFolder(): string;
  setExportFolder(v: string): void;
  getExportFormat(): ExportFormat;
  setExportFormat(f: ExportFormat): void;
  /** Erfüllt zugleich das CollapsibleStorage-Interface des Kit-Moduls. */
  getCollapsed(key: string): boolean | undefined;
  setCollapsed(key: string, collapsed: boolean): void;
}

export type TabId = "overview" | "detail" | "workouts";
const TAB_META: Record<TabId, { labelKey: string; icon: string }> = {
  overview: { labelKey: "tab.overview", icon: "layout-grid" },
  detail: { labelKey: "tab.detail", icon: "line-chart" },
  workouts: { labelKey: "tab.workouts", icon: "dumbbell" },
};

export class DashboardView extends ItemView {
  readonly host: DashboardHost;
  private cache: HealthCache | null = null;
  private detail: DetailState = { metricId: null, range: "3M" };
  private hub: HubController<TabId> | null = null;
  private importState: ImportState = IDLE;
  private importCtrl: ImportController | null = null;

  constructor(leaf: WorkspaceLeaf, host: DashboardHost) {
    super(leaf);
    this.host = host;
  }

  getViewType(): string { return VIEW_TYPE_DASHBOARD; }
  getDisplayText(): string { return t("view.title"); }
  getIcon(): string { return "heart-pulse"; }

  openDetail(metricId: string): void {
    this.detail = { ...this.detail, metricId };
    this.hub?.setTab("detail");
    // setTab ist ein No-op, wenn "detail" schon aktiv ist (Kit-Vertrag) — der neue
    // metricId braucht deshalb einen expliziten Refresh, unabhängig vom Tab-Wechsel.
    this.hub?.refreshActive();
  }

  refreshOverview(): void {
    if (this.hub?.currentTab() === "overview") this.hub.refreshActive();
  }

  async onOpen(): Promise<void> {
    this.cache = await this.host.loadCache();
    this.renderRoot();
  }

  private renderRoot(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("ah-dashboard");
    this.hub?.destroy();
    this.hub = null;

    if (!this.cache) { this.renderImportScreen(root); return; }

    const panels: HubPanel<TabId>[] = [
      this.makePanel("overview", (el) => renderOverview(el, this.cache!, this)),
      this.makePanel("detail", (el) =>
        renderDetail(el, this.cache!, this.detail, (s) => { this.detail = s; this.hub?.refreshActive(); }, this)),
      this.makePanel("workouts", (el) => renderWorkouts(el, this.cache!)),
    ];
    this.hub = buildHubInto(root, panels, "overview");
  }

  // Mount-once (Kit-Vertrag): der Container bleibt über Tab-Wechsel hinweg gemountet,
  // onShow räumt ihn leer und rendert neu — entspricht dem bisherigen renderActive()
  // pro Panel, nur jetzt über den Kit-Steuerkanal statt eigener Sichtbarkeits-Logik.
  private makePanel(id: TabId, render: (container: HTMLElement) => void): HubPanel<TabId> {
    const meta = TAB_META[id];
    let container: HTMLElement | null = null;
    return {
      id,
      get label(): string { return t(meta.labelKey); },
      icon: meta.icon,
      mount: (el: HTMLElement) => { container = el; },
      onShow: () => { if (container) { container.empty(); render(container); } },
      destroy: () => {},
    };
  }

  private renderImportScreen(root: HTMLElement): void {
    const host = root.createDiv({ cls: "ah-import-host" });
    renderImport(host, this.importState, {
      choose: () => { void this.startImport(); },
      abort: () => { this.importCtrl?.abort(); },
    });
  }

  private async startImport(): Promise<void> {
    const file = await this.host.pickExport();
    if (!file) return; // Nutzer hat den Dialog geschlossen

    // `ctrl` wird in der Closure statt `this.importCtrl` verglichen: Ein abgebrochener
    // (oder sonst noch laufender) vorheriger Controller kann nach dem Start eines neuen
    // Imports noch einen letzten Zustand emittieren (z.B. das finale "aborted" aus
    // seinem catch-Block). Ohne diesen Wächter würde dieser verspätete Callback den
    // bereits laufenden neuen Import-Zustand überschreiben.
    const ctrl: ImportController = this.host.createImportController((state) => {
      if (ctrl !== this.importCtrl) return;
      this.importState = state;
      // Während des Laufs nur den Import-Screen neu zeichnen, nicht das ganze Root.
      // Kein Re-Render-Throttle hier, bewusst: `onProgress` (pipeline.ts) feuert jetzt
      // im Zeittakt von yieldToUi (~4x/s), statt wie zuvor an 250k-Record-Meilensteinen
      // (PROGRESS_EVERY, ersatzlos gestrichen). renderImport() baut dabei nur die
      // fünf Elemente von ".ah-import-host" neu auf (el.empty() + rebuild), nicht das
      // gesamte Dashboard-Root — vier solche Rebuilds pro Sekunde sind unproblematisch.
      // Sollte die Update-Frequenz künftig steigen (kleineres yieldEveryMs) oder der
      // Import-Screen wachsen, ist ein Throttle hier der richtige nächste Schritt.
      const hostEl = this.contentEl.querySelector<HTMLElement>(".ah-import-host");
      if (hostEl) {
        renderImport(hostEl, state, {
          choose: () => { void this.startImport(); },
          abort: () => { this.importCtrl?.abort(); },
        });
      }
    });
    this.importCtrl = ctrl;

    await this.importCtrl.start(file);

    if (this.importState.status === "done") {
      this.cache = await this.host.loadCache();
      this.renderRoot();
    }
  }

  async onClose(): Promise<void> {
    // Ohne das würde ein laufender Import gegen ein losgelöstes DOM weiterparsen.
    // Bei einem Wiedereröffnen der View sähe der Nutzer wieder den leeren Import-Screen
    // (der neue View-Instanz liest den Cache, den der erste Lauf noch nicht geschrieben
    // hat) und könnte einen zweiten, parallelen Import auf denselben Cache-Pfad starten.
    this.importCtrl?.abort();
    this.hub?.destroy();
    this.contentEl.empty();
  }
}
