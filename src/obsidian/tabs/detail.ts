import type { HealthCache } from "../../core/types";
import type { RangeKey } from "../../core/rollup";
import type { TableVM } from "../../core/view-model";
import { buildDetailVM } from "../../core/view-model";
import { renderChart } from "../chart-render";
import type { DashboardView } from "../dashboard-view";
import { collapsibleSection } from "../../vendor/kit-obsidian/collapsible";
import { t } from "../../vendor/kit/i18n";

export interface DetailState { metricId: string | null; range: RangeKey; }

const RANGES: RangeKey[] = ["1M", "3M", "1Y", "all"];
const CHART_DIMS = { width: 640, height: 260, padding: 24 };
const VALUES_KEY = "detail-values";

export function renderDetail(
  el: HTMLElement, cache: HealthCache, state: DetailState, onState: (s: DetailState) => void,
  view: DashboardView,
): void {
  if (!state.metricId) {
    const hint = el.createDiv({ cls: "ah-detail-hint" });
    hint.createSpan({ text: t("detail.pickMetric") });
    return;
  }
  const vm = buildDetailVM(cache, state.metricId, state.range, CHART_DIMS);

  const head = el.createDiv({ cls: "ah-detail-head" });
  head.createEl("h2", { text: vm.name });
  if (vm.rangeLabel) head.createSpan({ cls: "ah-detail-range", text: vm.rangeLabel });

  const tabs = el.createDiv({ cls: "ah-range-bar" });
  for (const rk of RANGES) {
    const btn = tabs.createEl("button", { text: t("range." + rk) });
    btn.addClass("ah-range-btn");
    if (rk === state.range) btn.addClass("is-active");
    btn.addEventListener("click", () => onState({ metricId: state.metricId, range: rk }));
  }

  if (vm.empty) {
    const hint = el.createDiv({ cls: "ah-detail-hint" });
    hint.createSpan({ text: t("detail.noData") });
  } else {
    const chartBox = el.createDiv({ cls: "ah-detail-chart" });
    renderChart(chartBox, vm.chart, { axis: vm.axis });
  }

  const stats = el.createDiv({ cls: "ah-stat-row" });
  for (const row of vm.stats) {
    const cell = stats.createDiv({ cls: "ah-stat-cell" });
    cell.createSpan({ cls: "ah-stat-label", text: row.label });
    cell.createSpan({ cls: "ah-stat-value", text: row.value });
  }

  // Kein Export von nichts: ohne Punkte im Zeitraum entfällt die Sektion ganz.
  if (!vm.empty) renderValuesSection(el, vm.table, view);
}

function renderValuesSection(el: HTMLElement, table: TableVM, view: DashboardView): void {
  const body = collapsibleSection(el, {
    title: `${t("table.title")} (${table.rows.length})`,
    key: VALUES_KEY,
    defaultCollapsed: true,
    storage: view.host,
  });
  renderValuesTable(body, table);
}

function renderValuesTable(parent: HTMLElement, table: TableVM): void {
  const wrap = parent.createDiv({ cls: "ah-table-wrap" });
  const el = wrap.createEl("table", { cls: "ah-table" });
  const headRow = el.createEl("thead").createEl("tr");
  for (const h of table.headers) headRow.createEl("th", { text: h });
  const tbody = el.createEl("tbody");
  for (const row of table.rows) {
    const tr = tbody.createEl("tr");
    for (const cell of row) tr.createEl("td", { text: cell });
  }
}
