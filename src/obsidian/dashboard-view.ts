import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import { t } from "../vendor/kit/i18n";
import type { HealthCache } from "../core/types";
import { IDLE, type ImportState } from "../core/import-state";
import type { ImportController } from "./import-controller";
import { renderImport } from "./tabs/import";
import { renderOverview } from "./tabs/overview";
import { renderDetail, type DetailState } from "./tabs/detail";
import { renderWorkouts } from "./tabs/workouts";

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
const TABS: Array<{ id: TabId; labelKey: string; icon: string }> = [
  { id: "overview", labelKey: "tab.overview", icon: "layout-grid" },
  { id: "detail", labelKey: "tab.detail", icon: "line-chart" },
  { id: "workouts", labelKey: "tab.workouts", icon: "dumbbell" },
];

export class DashboardView extends ItemView {
  readonly host: DashboardHost;
  private cache: HealthCache | null = null;
  private active: TabId = "overview";
  private detail: DetailState = { metricId: null, range: "3M" };
  private panels = new Map<TabId, HTMLElement>();
  private tabButtons = new Map<TabId, HTMLElement>();
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
    this.switchTab("detail");
    this.renderActive();
  }

  refreshOverview(): void { if (this.active === "overview") this.renderActive(); }

  async onOpen(): Promise<void> {
    this.cache = await this.host.loadCache();
    this.renderRoot();
  }

  private renderRoot(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("ah-dashboard");
    this.panels.clear();
    this.tabButtons.clear();

    if (!this.cache) { this.renderImportScreen(root); return; }

    const head = root.createDiv({ cls: "ah-tabbar" });
    for (const tab of TABS) {
      const btn = head.createDiv({ cls: "ah-tab" });
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", t(tab.labelKey));
      const icon = btn.createSpan({ cls: "ah-tab-icon" });
      setIcon(icon, tab.icon);
      btn.createSpan({ cls: "ah-tab-label", text: t(tab.labelKey) });
      btn.addEventListener("click", () => { this.switchTab(tab.id); this.renderActive(); });
      this.tabButtons.set(tab.id, btn);
    }

    const content = root.createDiv({ cls: "ah-content" });
    for (const tab of TABS) {
      const panel = content.createDiv({ cls: "ah-panel" });
      this.panels.set(tab.id, panel);
    }
    this.switchTab(this.active);
    this.renderActive();
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
      this.active = "overview";
      this.renderRoot();
    }
  }

  private switchTab(id: TabId): void {
    this.active = id;
    for (const [tid, panel] of this.panels) panel.toggleClass("is-hidden", tid !== id);
    for (const [tid, btn] of this.tabButtons) btn.toggleClass("is-active", tid === id);
  }

  // Mount-once: nur der aktive Panel-Inhalt wird (neu) gerendert; State der anderen bleibt im DOM.
  private renderActive(): void {
    if (!this.cache) return;
    const panel = this.panels.get(this.active);
    if (!panel) return;
    panel.empty();
    if (this.active === "overview") {
      renderOverview(panel, this.cache, this);
    } else if (this.active === "detail") {
      renderDetail(panel, this.cache, this.detail, (s) => { this.detail = s; this.renderActive(); }, this);
    } else {
      renderWorkouts(panel, this.cache);
    }
  }

  async onClose(): Promise<void> {
    // Ohne das würde ein laufender Import gegen ein losgelöstes DOM weiterparsen.
    // Bei einem Wiedereröffnen der View sähe der Nutzer wieder den leeren Import-Screen
    // (der neue View-Instanz liest den Cache, den der erste Lauf noch nicht geschrieben
    // hat) und könnte einen zweiten, parallelen Import auf denselben Cache-Pfad starten.
    this.importCtrl?.abort();
    this.contentEl.empty();
  }
}
