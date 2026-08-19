import type { HealthCache } from "../../core/types";
import { summarizeWorkouts } from "../../core/workout-summary";
import { workoutTypeName } from "../../core/workout-catalog";
import { formatDuration, formatValue, formatTickLabel } from "../../core/format";
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

  // Der jüngste Monat mit Daten — er ist der letzte Balken des Charts, die Zeile
  // darunter liest sich als dessen Beschriftung.
  const letzter = summary.monthly[summary.monthly.length - 1];
  if (letzter) {
    el.createDiv({
      cls: "ah-workout-total",
      text: t(
        "workouts.total",
        formatTickLabel(letzter.key, "month"),
        letzter.value,
        letzter.distanceKm > 0 ? formatValue(letzter.distanceKm, "km") : t("workouts.noValue"),
        letzter.energyKcal > 0 ? formatValue(letzter.energyKcal, "kcal") : t("workouts.noValue"),
      ),
    });
  }

  el.createEl("h3", { text: t("workouts.recent") });
  const list = el.createDiv({ cls: "ah-workout-list" });
  for (const w of summary.recent) {
    const row = list.createDiv({ cls: "ah-workout-row" });
    row.createSpan({ cls: "ah-workout-type", text: workoutTypeName(w.type) });
    row.createSpan({ cls: "ah-workout-date", text: w.date });
    row.createSpan({ cls: "ah-workout-dur", text: formatDuration(w.durationMin) });
    row.createSpan({
      cls: "ah-workout-dist",
      text: w.distanceKm !== undefined ? formatValue(w.distanceKm, "km") : t("workouts.noValue"),
    });
    row.createSpan({
      cls: "ah-workout-kcal",
      text: w.energyKcal !== undefined ? formatValue(w.energyKcal, "kcal") : t("workouts.noValue"),
    });
  }
}
