import type { HealthCache } from "./types";
import { describeMetric, type Category } from "./metric-catalog";
import { resolveRange, rollupDaily, type RangeKey } from "./rollup";
import { buildChartGeometry, type ChartDims, type ChartGeometry } from "./chart-geometry";
import { computeStats } from "./series-stats";
import { formatValue } from "./format";
import { t } from "../vendor/kit/i18n";
import { localeTag } from "../i18n/strings";

export interface TileVM { id: string; name: string; category: Category; valueText: string; spark: ChartGeometry; }
export interface OverviewVM {
  favorites: TileVM[];
  sections: Array<{ category: Category; categoryLabel: string; tiles: TileVM[] }>;
}
export interface StatRow { label: string; value: string; }
export interface DetailVM {
  id: string; name: string; unit: string; empty: boolean;
  rangeLabel: string; chart: ChartGeometry; stats: StatRow[];
}

export const CATEGORY_ORDER: Category[] = ["activity", "heart", "body", "sleep", "nutrition", "other"];

function tileFor(cache: HealthCache, id: string, sparkDims: ChartDims): TileVM {
  const series = cache.metrics[id];
  const info = describeMetric(id, series.policy);
  const range = cache.dateRange ?? { from: "0000-01-01", to: "9999-12-31" };
  const r = resolveRange("all", range);
  const points = rollupDaily(series.daily, series.policy, r);
  const stats = computeStats(series.daily, series.policy, r);
  const headline = series.policy === "measure" ? stats.avg ?? 0 : stats.avgPerDay ?? 0;
  return {
    id, name: info.name, category: info.category,
    valueText: formatValue(headline, series.unit),
    spark: buildChartGeometry(points, info.chartKind, sparkDims),
  };
}

export function buildOverviewVM(cache: HealthCache, favorites: string[], sparkDims: ChartDims): OverviewVM {
  const favSet = new Set(favorites);
  const ids = Object.keys(cache.metrics);
  const favTiles = ids.filter((id) => favSet.has(id)).map((id) => tileFor(cache, id, sparkDims));

  const byCat = new Map<Category, TileVM[]>();
  for (const id of ids) {
    if (favSet.has(id)) continue;
    const tile = tileFor(cache, id, sparkDims);
    const list = byCat.get(tile.category) ?? [];
    list.push(tile);
    byCat.set(tile.category, list);
  }
  const sections = CATEGORY_ORDER
    .filter((c) => byCat.has(c))
    .map((category) => ({
      category,
      categoryLabel: t("category." + category),
      tiles: (byCat.get(category) as TileVM[]).sort((a, b) => a.name.localeCompare(b.name, localeTag())),
    }));
  return { favorites: favTiles, sections };
}

export function buildDetailVM(cache: HealthCache, metricId: string, range: RangeKey, dims: ChartDims): DetailVM {
  const series = cache.metrics[metricId];
  if (!series || !cache.dateRange) {
    return { id: metricId, name: metricId, unit: "", empty: true, rangeLabel: "", chart: buildChartGeometry([], "line", dims), stats: [] };
  }
  const info = describeMetric(metricId, series.policy);
  const r = resolveRange(range, cache.dateRange);
  const points = rollupDaily(series.daily, series.policy, r);
  const chart = buildChartGeometry(points, info.chartKind, dims);
  const s = computeStats(series.daily, series.policy, r);
  const stats: StatRow[] = series.policy === "measure"
    ? [
        { label: t("stat.avg"), value: s.avg !== undefined ? formatValue(s.avg, series.unit) : "—" },
        { label: t("stat.min"), value: s.min !== undefined ? formatValue(s.min, series.unit) : "—" },
        { label: t("stat.max"), value: s.max !== undefined ? formatValue(s.max, series.unit) : "—" },
        { label: t("stat.last"), value: s.last !== undefined ? formatValue(s.last, series.unit) : "—" },
      ]
    : [
        { label: t("stat.avgPerDay"), value: s.avgPerDay !== undefined ? formatValue(s.avgPerDay, series.unit) : "—" },
        { label: t("stat.maxDay"), value: s.maxDay !== undefined ? formatValue(s.maxDay, series.unit) : "—" },
        { label: t("stat.total"), value: s.total !== undefined ? formatValue(s.total, series.unit) : "—" },
      ];
  const rangeLabel = points.length ? `${points[0].key} – ${points[points.length - 1].key}` : "";
  return { id: metricId, name: info.name, unit: series.unit, empty: points.length === 0, rangeLabel, chart, stats };
}
