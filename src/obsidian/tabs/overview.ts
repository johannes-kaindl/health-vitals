import { setIcon } from "obsidian";
import type { HealthCache } from "../../core/types";
import { buildOverviewVM, type TileVM } from "../../core/view-model";
import { renderChart } from "../chart-render";
import type { DashboardView } from "../dashboard-view";

const SPARK_DIMS = { width: 120, height: 36, padding: 2 };

export function renderOverview(el: HTMLElement, cache: HealthCache, view: DashboardView): void {
  const favorites = view.host.getFavorites();
  const vm = buildOverviewVM(cache, favorites, SPARK_DIMS);

  if (vm.favorites.length) {
    const favSection = el.createDiv({ cls: "ah-fav-section" });
    favSection.createEl("h3", { text: "★ Favoriten" });
    const grid = favSection.createDiv({ cls: "ah-tile-grid" });
    for (const t of vm.favorites) renderTile(grid, t, cache, view, true);
  }

  for (const section of vm.sections) {
    const details = el.createEl("details", { cls: "ah-cat" });
    if (!vm.favorites.length && section === vm.sections[0]) details.setAttribute("open", "");
    const summary = details.createEl("summary", { text: `${section.category} (${section.tiles.length})` });
    summary.addClass("ah-cat-summary");
    const grid = details.createDiv({ cls: "ah-tile-grid" });
    for (const t of section.tiles) renderTile(grid, t, cache, view, false);
  }
}

function renderTile(grid: HTMLElement, t: TileVM, _cache: HealthCache, view: DashboardView, isFav: boolean): void {
  const tile = grid.createDiv({ cls: "ah-tile" });
  tile.setAttribute("role", "button");
  tile.setAttribute("aria-label", `${t.name} öffnen`);
  tile.addEventListener("click", () => view.openDetail(t.id));

  const head = tile.createDiv({ cls: "ah-tile-head" });
  head.createSpan({ cls: "ah-tile-name", text: t.name });
  const star = head.createSpan({ cls: "ah-tile-star" });
  setIcon(star, isFav ? "star" : "star-off");
  star.setAttribute("aria-label", isFav ? "Aus Favoriten entfernen" : "Zu Favoriten");
  star.addEventListener("click", (ev: MouseEvent) => {
    ev.stopPropagation();
    void view.host.toggleFavorite(t.id).then(() => view.refreshOverview());
  });

  tile.createDiv({ cls: "ah-tile-value", text: t.valueText });
  const chartBox = tile.createDiv({ cls: "ah-tile-spark" });
  renderChart(chartBox, t.spark);
}
