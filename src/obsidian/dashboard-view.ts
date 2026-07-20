import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type { HealthCache } from "../core/types";
import { IDLE, type ImportState } from "../core/import-state";
import type { ImportController } from "./import-controller";
import { renderImport } from "./tabs/import";
import { renderOverview } from "./tabs/overview";
import { renderDetail, type DetailState } from "./tabs/detail";
import { renderWorkouts } from "./tabs/workouts";

export const VIEW_TYPE_DASHBOARD = "apple-health-dashboard";

export interface DashboardHost {
  loadCache(): Promise<HealthCache | null>;
  getFavorites(): string[];
  toggleFavorite(id: string): Promise<void>;
  createImportController(onState: (s: ImportState) => void): ImportController;
  pickExport(): Promise<File | null>;
}

export type TabId = "overview" | "detail" | "workouts";
const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "overview", label: "Übersicht", icon: "layout-grid" },
  { id: "detail", label: "Detail", icon: "line-chart" },
  { id: "workouts", label: "Workouts", icon: "dumbbell" },
];

export class DashboardView extends ItemView {
  readonly host: DashboardHost;
  private cache: HealthCache | null = null;
  private active: TabId = "overview";
  private detail: DetailState = { metricId: null, range: "3M" };
  private panels = new Map<TabId, HTMLElement>();
  private tabButtons = new Map<TabId, HTMLElement>();
  // Aufklapp-Zustand der Übersicht-Kategorien — im View gehalten, damit er den
  // Re-Render (z.B. nach Favoriten-Toggle) überlebt (Mount-once-Invariante).
  private expandedCats = new Set<string>();
  private overviewSeeded = false;
  private importState: ImportState = IDLE;
  private importCtrl: ImportController | null = null;

  constructor(leaf: WorkspaceLeaf, host: DashboardHost) {
    super(leaf);
    this.host = host;
  }

  getViewType(): string { return VIEW_TYPE_DASHBOARD; }
  getDisplayText(): string { return "Apple Health"; }
  getIcon(): string { return "heart-pulse"; }

  openDetail(metricId: string): void {
    this.detail = { ...this.detail, metricId };
    this.switchTab("detail");
    this.renderActive();
  }

  refreshOverview(): void { if (this.active === "overview") this.renderActive(); }

  /** Set der aufgeklappten Kategorie-Namen — von renderOverview gelesen und (per toggle) gepflegt. */
  expandedCategories(): Set<string> { return this.expandedCats; }

  /** Führt `seed` genau einmal aus (erster Übersicht-Render) — für den Default-Aufklapp-Zustand. */
  seedExpandedOnce(seed: () => void): void {
    if (this.overviewSeeded) return;
    this.overviewSeeded = true;
    seed();
  }

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
    for (const t of TABS) {
      const btn = head.createDiv({ cls: "ah-tab" });
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", t.label);
      const icon = btn.createSpan({ cls: "ah-tab-icon" });
      setIcon(icon, t.icon);
      btn.createSpan({ cls: "ah-tab-label", text: t.label });
      btn.addEventListener("click", () => { this.switchTab(t.id); this.renderActive(); });
      this.tabButtons.set(t.id, btn);
    }

    const content = root.createDiv({ cls: "ah-content" });
    for (const t of TABS) {
      const panel = content.createDiv({ cls: "ah-panel" });
      this.panels.set(t.id, panel);
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

    this.importCtrl = this.host.createImportController((state) => {
      this.importState = state;
      // Während des Laufs nur den Import-Screen neu zeichnen, nicht das ganze Root.
      const hostEl = this.contentEl.querySelector<HTMLElement>(".ah-import-host");
      if (hostEl) {
        renderImport(hostEl, state, {
          choose: () => { void this.startImport(); },
          abort: () => { this.importCtrl?.abort(); },
        });
      }
    });

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
      renderDetail(panel, this.cache, this.detail, (s) => { this.detail = s; this.renderActive(); });
    } else {
      renderWorkouts(panel, this.cache);
    }
  }

  async onClose(): Promise<void> { this.contentEl.empty(); }
}
