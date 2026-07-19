import { ItemView, WorkspaceLeaf, ButtonComponent, setIcon } from "obsidian";
import type { HealthCache } from "../core/types";
import { renderOverview } from "./tabs/overview";
import { renderDetail, type DetailState } from "./tabs/detail";
import { renderWorkouts } from "./tabs/workouts";

export const VIEW_TYPE_DASHBOARD = "apple-health-dashboard";

export interface DashboardHost {
  loadCache(): Promise<HealthCache | null>;
  getFavorites(): string[];
  toggleFavorite(id: string): Promise<void>;
  runImport(): void;
}

export type TabId = "overview" | "detail" | "workouts";
const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "overview", label: "Übersicht", icon: "layout-grid" },
  { id: "detail", label: "Detail", icon: "line-chart" },
  { id: "workouts", label: "Workouts", icon: "dumbbell" },
];

export class DashboardView extends ItemView {
  private host: DashboardHost;
  private cache: HealthCache | null = null;
  private active: TabId = "overview";
  private detail: DetailState = { metricId: null, range: "3M" };
  private panels = new Map<TabId, HTMLElement>();
  private tabButtons = new Map<TabId, HTMLElement>();

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

  async onOpen(): Promise<void> {
    this.cache = await this.host.loadCache();
    const root = this.contentEl;
    root.empty();
    root.addClass("ah-dashboard");

    if (!this.cache) { this.renderEmptyState(root); return; }

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

  private renderEmptyState(root: HTMLElement): void {
    const box = root.createDiv({ cls: "ah-empty" });
    box.createEl("h3", { text: "Noch kein Import" });
    box.createEl("p", { text: "Es wurde noch keine health-cache.json gefunden. Führe zuerst den Import aus." });
    new ButtonComponent(box).setButtonText("Import ausführen").setCta().onClick(() => this.host.runImport());
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
