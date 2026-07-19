import type { HealthCache } from "../../core/types";
import type { RangeKey } from "../../core/rollup";
import { buildDetailVM } from "../../core/view-model";
import { renderChart } from "../chart-render";

export interface DetailState { metricId: string | null; range: RangeKey; }

const RANGES: RangeKey[] = ["1M", "3M", "1J", "all"];
const RANGE_LABEL: Record<RangeKey, string> = { "1M": "1M", "3M": "3M", "1J": "1J", all: "Alles" };
const CHART_DIMS = { width: 640, height: 260, padding: 24 };

export function renderDetail(
  el: HTMLElement, cache: HealthCache, state: DetailState, onState: (s: DetailState) => void,
): void {
  if (!state.metricId) {
    const hint = el.createDiv({ cls: "ah-detail-hint" });
    hint.createSpan({ text: "Wähle in der Übersicht eine Metrik aus." });
    return;
  }
  const vm = buildDetailVM(cache, state.metricId, state.range, CHART_DIMS);

  const head = el.createDiv({ cls: "ah-detail-head" });
  head.createEl("h2", { text: vm.name });
  if (vm.rangeLabel) head.createSpan({ cls: "ah-detail-range", text: vm.rangeLabel });

  const tabs = el.createDiv({ cls: "ah-range-bar" });
  for (const rk of RANGES) {
    const btn = tabs.createEl("button", { text: RANGE_LABEL[rk] });
    btn.addClass("ah-range-btn");
    if (rk === state.range) btn.addClass("is-active");
    btn.addEventListener("click", () => onState({ metricId: state.metricId, range: rk }));
  }

  if (vm.empty) {
    const hint = el.createDiv({ cls: "ah-detail-hint" });
    hint.createSpan({ text: "Keine Daten in diesem Zeitraum." });
  } else {
    const chartBox = el.createDiv({ cls: "ah-detail-chart" });
    renderChart(chartBox, vm.chart, { axis: true });
  }

  const stats = el.createDiv({ cls: "ah-stat-row" });
  for (const row of vm.stats) {
    const cell = stats.createDiv({ cls: "ah-stat-cell" });
    cell.createSpan({ cls: "ah-stat-label", text: row.label });
    cell.createSpan({ cls: "ah-stat-value", text: row.value });
  }
}
