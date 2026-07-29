import { setIcon } from "obsidian";
import type { HealthCache } from "../../core/types";
import { buildOverviewVM, type TileVM } from "../../core/view-model";
import { renderChart } from "../chart-render";
import type { DashboardView } from "../dashboard-view";
import { resolveCollapsed } from "../../vendor/kit-obsidian/collapsible";
import { t } from "../../vendor/kit/i18n";

const SPARK_DIMS = { width: 120, height: 36, padding: 2 };

/** Schlüssel-Präfix im gemeinsamen `collapsed`-Speicher (data.json). Die Werte-Sektion im
 *  Detail-Tab liegt als "detail-values" daneben — ein Speicher für beide Aufklapp-Zustände. */
const CAT_KEY_PREFIX = "overview-cat:";

/** Verdrahtet ein Element als Schalter: Klick UND Tastatur. Ein reiner Click-Handler ist
 *  für Mausnutzer vollständig und für alle anderen unerreichbar — `role="button"` allein
 *  verspricht Bedienbarkeit, die ohne tabindex und Key-Handler nicht existiert. */
function activatable(el: HTMLElement, label: string, onActivate: () => void): void {
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", label);
  el.addEventListener("click", (ev: MouseEvent) => {
    ev.stopPropagation();
    onActivate();
  });
  el.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    // Leertaste scrollt sonst die Seite; bei Enter unschädlich. stopPropagation hält den
    // Tastendruck auf dem Stern von der umschließenden Kachel fern — sonst öffnet ein
    // Favoriten-Wechsel per Tastatur zusätzlich die Detailansicht.
    ev.preventDefault();
    ev.stopPropagation();
    onActivate();
  });
}

export function renderOverview(el: HTMLElement, cache: HealthCache, view: DashboardView): void {
  const favorites = view.host.getFavorites();
  const vm = buildOverviewVM(cache, favorites, SPARK_DIMS);

  if (vm.favorites.length) {
    const favSection = el.createDiv({ cls: "ah-fav-section" });
    favSection.createEl("h3", { text: t("overview.favorites") });
    const grid = favSection.createDiv({ cls: "ah-tile-grid" });
    for (const tile of vm.favorites) renderTile(grid, tile, view, true);
  }

  // Aufklapp-Zustand liegt im selben persistenten Speicher wie die Werte-Sektion des
  // Detail-Tabs (data.json über den Host). Er überlebt damit nicht nur den Re-Render
  // nach einem Favoriten-Toggle, sondern auch den Neustart von Obsidian.
  // Schlüssel ist der sprachneutrale Kategorie-Key, nicht das übersetzte Label.
  vm.sections.forEach((section, i) => {
    const key = CAT_KEY_PREFIX + section.category;
    // Ohne gespeicherten Wert steht die erste Kategorie offen und der Rest zu — derselbe
    // Startzustand wie zuvor, nur dass die Wahl des Nutzers ihn jetzt dauerhaft ablöst.
    let collapsed = resolveCollapsed(key, i > 0, view.host);

    const details = el.createEl("details", { cls: "ah-cat" });
    if (!collapsed) details.setAttribute("open", "");
    const summary = details.createEl("summary", { text: `${section.categoryLabel} (${section.tiles.length})` });
    summary.addClass("ah-cat-summary");
    details.addEventListener("toggle", () => {
      const now = !details.open;
      // Das Setzen des open-Attributs oben stößt selbst ein toggle-Event an; ohne diesen
      // Vergleich schriebe jeder Render den unveränderten Zustand erneut nach data.json.
      if (now === collapsed) return;
      collapsed = now;
      view.host.setCollapsed(key, now);
    });
    const grid = details.createDiv({ cls: "ah-tile-grid" });
    for (const tile of section.tiles) renderTile(grid, tile, view, false);
  });

  if (vm.favorites.length === 0 && vm.sections.length === 0) {
    el.createDiv({ cls: "ah-detail-hint", text: t("overview.emptyMetrics") });
  }
}

/** Sucht über das data-Attribut statt per Selektor-Interpolation: Metrik-IDs sind fremde
 *  Bezeichner aus dem Apple-Export und müssten in einem Selektor escaped werden. */
function focusStar(view: DashboardView, metricId: string): void {
  const stars = Array.from(view.contentEl.querySelectorAll<HTMLElement>(".ah-tile-star"));
  stars.find((e) => e.dataset.metric === metricId)?.focus();
}

function renderTile(grid: HTMLElement, tile: TileVM, view: DashboardView, isFav: boolean): void {
  const el = grid.createDiv({ cls: "ah-tile" });
  activatable(el, t("a11y.openMetric", tile.name), () => view.openDetail(tile.id));

  const head = el.createDiv({ cls: "ah-tile-head" });
  head.createSpan({ cls: "ah-tile-name", text: tile.name });
  const star = head.createSpan({ cls: "ah-tile-star" });
  star.dataset.metric = tile.id;
  setIcon(star, isFav ? "star" : "star-off");
  activatable(star, isFav ? t("a11y.removeFavorite") : t("a11y.addFavorite"), () => {
    void view.host.toggleFavorite(tile.id)
      .then(() => {
        view.refreshOverview();
        // Der Re-Render ersetzt das gerade betätigte Element; ohne Nachführung landet der
        // Fokus auf dem Body und man müsste sich zu jedem weiteren Stern neu durchtabben.
        // Die Kachel wechselt dabei zwischen Favoriten-Raster und Kategorie, deshalb wird
        // über die Metrik-ID gesucht statt über die Position.
        focusStar(view, tile.id);
      })
      .catch((e) => console.error(t("log.favSaveFailed"), e));
  });

  el.createDiv({ cls: "ah-tile-value", text: tile.valueText });
  const chartBox = el.createDiv({ cls: "ah-tile-spark" });
  renderChart(chartBox, tile.spark);
}
