import type { HealthCache } from "../../core/types";
import { summarizeWorkouts } from "../../core/workout-summary";
import { workoutTypeName } from "../../core/workout-catalog";
import { formatDuration } from "../../core/format";
import { buildChartGeometry } from "../../core/chart-geometry";
import type { RollupPoint } from "../../core/rollup";
import { renderChart } from "../chart-render";
import { t } from "../../vendor/kit/i18n";

const CHART_DIMS = { width: 640, height: 160, padding: 20 };
const RECENT_LIMIT = 50;

export function renderWorkouts(el: HTMLElement, cache: HealthCache): void {
  const summary = summarizeWorkouts(cache.workouts, RECENT_LIMIT);

  if (cache.workouts.length === 0) {
    el.createDiv({ cls: "ah-detail-hint", text: t("workouts.emptyExport") });
    return;
  }

  el.createEl("h3", { text: t("workouts.perMonth") });
  const points: RollupPoint[] = summary.monthly.map((m) => ({ key: m.key, value: m.value }));
  const chartBox = el.createDiv({ cls: "ah-detail-chart" });
  renderChart(chartBox, buildChartGeometry(points, "bar", CHART_DIMS), { grid: true });

  el.createEl("h3", { text: t("workouts.recent") });
  const list = el.createDiv({ cls: "ah-workout-list" });
  for (const w of summary.recent) {
    const row = list.createDiv({ cls: "ah-workout-row" });
    row.createSpan({ cls: "ah-workout-type", text: workoutTypeName(w.type) });
    row.createSpan({ cls: "ah-workout-date", text: w.date });
    row.createSpan({ cls: "ah-workout-dur", text: formatDuration(w.durationMin) });
  }
}
