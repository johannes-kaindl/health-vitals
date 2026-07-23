import { setIcon } from "obsidian";
import type { HealthCache } from "../../core/types";
import { buildOverviewVM, type TileVM } from "../../core/view-model";
import { renderChart } from "../chart-render";
import type { DashboardView } from "../dashboard-view";
import { t } from "../../vendor/kit/i18n";

const SPARK_DIMS = { width: 120, height: 36, padding: 2 };

export function renderOverview(el: HTMLElement, cache: HealthCache, view: DashboardView): void {
  const favorites = view.host.getFavorites();
  const vm = buildOverviewVM(cache, favorites, SPARK_DIMS);

  if (vm.favorites.length) {
    const favSection = el.createDiv({ cls: "ah-fav-section" });
    favSection.createEl("h3", { text: t("overview.favorites") });
    const grid = favSection.createDiv({ cls: "ah-tile-grid" });
    for (const tile of vm.favorites) renderTile(grid, tile, cache, view, true);
  }

  // Aufklapp-Zustand aus dem View: überlebt Re-Render (z.B. Favoriten-Toggle).
  // Schlüssel ist der sprachneutrale Kategorie-Key (section.category), nicht das Label.
  const expanded = view.expandedCategories();
  view.seedExpandedOnce(() => { if (vm.sections.length > 0) expanded.add(vm.sections[0].category); });

  for (const section of vm.sections) {
    const details = el.createEl("details", { cls: "ah-cat" });
    if (expanded.has(section.category)) details.setAttribute("open", "");
    const summary = details.createEl("summary", { text: `${section.categoryLabel} (${section.tiles.length})` });
    summary.addClass("ah-cat-summary");
    details.addEventListener("toggle", () => {
      if (details.open) expanded.add(section.category);
      else expanded.delete(section.category);
    });
    const grid = details.createDiv({ cls: "ah-tile-grid" });
    for (const tile of section.tiles) renderTile(grid, tile, cache, view, false);
  }

  if (vm.favorites.length === 0 && vm.sections.length === 0) {
    el.createDiv({ cls: "ah-detail-hint", text: t("overview.emptyMetrics") });
  }
}

function renderTile(grid: HTMLElement, tile: TileVM, _cache: HealthCache, view: DashboardView, isFav: boolean): void {
  const el = grid.createDiv({ cls: "ah-tile" });
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", t("a11y.openMetric", tile.name));
  el.addEventListener("click", () => view.openDetail(tile.id));

  const head = el.createDiv({ cls: "ah-tile-head" });
  head.createSpan({ cls: "ah-tile-name", text: tile.name });
  const star = head.createSpan({ cls: "ah-tile-star" });
  setIcon(star, isFav ? "star" : "star-off");
  star.setAttribute("aria-label", isFav ? t("a11y.removeFavorite") : t("a11y.addFavorite"));
  star.addEventListener("click", (ev: MouseEvent) => {
    ev.stopPropagation();
    void view.host.toggleFavorite(tile.id)
      .then(() => view.refreshOverview())
      .catch((e) => console.error(t("log.favSaveFailed"), e));
  });

  el.createDiv({ cls: "ah-tile-value", text: tile.valueText });
  const chartBox = el.createDiv({ cls: "ah-tile-spark" });
  renderChart(chartBox, tile.spark);
}
