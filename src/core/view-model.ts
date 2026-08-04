import type { HealthCache } from "./types";
import { describeMetric, type Category } from "./metric-catalog";
import { resolveRange, rollupDaily, type RangeKey, type RollupPoint, type Granularity } from "./rollup";
import { buildChartGeometry, type ChartDims, type ChartGeometry } from "./chart-geometry";
import { computeStats } from "./series-stats";
import { formatByPolicy, formatTickLabel } from "./format";
import type { Policy } from "./types";
import { t } from "../vendor/kit/i18n";
import { localeTag } from "../i18n/strings";

export interface TileVM { id: string; name: string; category: Category; valueText: string; spark: ChartGeometry; }
export interface OverviewVM {
  favorites: TileVM[];
  sections: Array<{ category: Category; categoryLabel: string; tiles: TileVM[] }>;
}
export interface StatRow { label: string; value: string; }
export interface AxisVM {
  x: Array<{ leftPct: number; label: string }>;
  y: Array<{ topPct: number; label: string }>;
}
export interface TableVM {
  headers: string[];
  rows: string[][];     // locale-formatiert — Anzeige und Markdown
  rowsRaw: string[][];  // rohe Zahlen mit Punkt — CSV
}
export interface DetailVM {
  id: string; name: string; unit: string; empty: boolean;
  rangeLabel: string; chart: ChartGeometry; stats: StatRow[];
  axis: AxisVM; table: TableVM;
}

const EMPTY_TABLE: TableVM = { headers: [], rows: [], rowsRaw: [] };
const EMPTY_AXIS: AxisVM = { x: [], y: [] };

function colDateKey(g: Granularity): string {
  if (g === "week") return "table.colWeek";
  if (g === "month") return "table.colMonth";
  return "table.colDate";
}

/** Die Einheit steht im Kopf, nie in der Zelle: sonst wiederholt sie sich
 *  hundertfach und macht die Werte für Weiterverarbeitung unbrauchbar.
 *
 *  Ausnahme `duration`: Dort trägt die Zelle selbst schon "7h 12m", eine
 *  Kopfzeile "(min)" darüber widerspräche dem sichtbaren Inhalt. */
function withUnit(label: string, unit: string, policy: Policy): string {
  return unit && policy !== "duration" ? `${label} (${unit})` : label;
}

function fmtCell(n: number | undefined, policy: Policy): string {
  return n === undefined ? "—" : formatByPolicy(n, "", policy);
}

/** Rohwert fürs CSV: Punkt-Dezimaltrenner, drei Nachkommastellen. formatValue
 *  liefert auf Deutsch "1.234,5" — das zerlegt eine komma-getrennte CSV-Zelle,
 *  und selbst gequotet liest eine Tabellenkalkulation den Wert als Text. */
function rawCell(n: number | undefined): string {
  return n === undefined ? "" : String(Math.round(n * 1000) / 1000);
}

function buildTable(points: RollupPoint[], policy: Policy, unit: string, g: Granularity): TableVM {
  const dateCol = t(colDateKey(g));
  if (policy === "measure") {
    return {
      headers: [
        dateCol,
        withUnit(t("stat.avg"), unit, policy),
        withUnit(t("stat.min"), unit, policy),
        withUnit(t("stat.max"), unit, policy),
      ],
      rows: points.map((p) => [p.key, fmtCell(p.value, policy), fmtCell(p.min, policy), fmtCell(p.max, policy)]),
      rowsRaw: points.map((p) => [p.key, rawCell(p.value), rawCell(p.min), rawCell(p.max)]),
    };
  }
  return {
    headers: [dateCol, withUnit(t("table.colValue"), unit, policy)],
    rows: points.map((p) => [p.key, fmtCell(p.value, policy)]),
    rowsRaw: points.map((p) => [p.key, rawCell(p.value)]),
  };
}

export const CATEGORY_ORDER: Category[] = ["activity", "heart", "body", "sleep", "nutrition", "other"];

/** Kachel-Memo, gekeyt auf die Cache-Identität. `tileFor` rollt die vollständige Historie
 *  einer Metrik auf und baut daraus die Sparkline-Geometrie — bei ~60 Metriken lief das
 *  bislang bei JEDEM Übersicht-Render komplett neu, also auch bei jedem Favoriten-Toggle
 *  und jeder Rückkehr auf den Tab. Das Ergebnis hängt aber nur an (cache, id, dims), nicht
 *  an den Favoriten: die ändern ausschließlich, in welchen Topf eine fertige Kachel fällt.
 *
 *  WeakMap auf dem Cache-Objekt: Ein Import ersetzt den Cache durch ein neues Objekt, damit
 *  verfehlt jeder Lookup den alten Eintrag (korrekte Invalidierung) und der alte Teilbaum
 *  wird einsammelbar — kein Eviktions-Handling nötig. Die Kachel-Texte kommen aus `t()`;
 *  ein Sprachwechsel verlangt in diesem Plugin ohnehin einen Obsidian-Neustart, der das
 *  Modul samt Memo neu lädt. */
const tileMemo = new WeakMap<HealthCache, Map<string, TileVM>>();

/** Dims gehören in den Schlüssel, obwohl heute nur ein Aufrufer mit einer festen Größe
 *  existiert: Sie stecken in der zurückgegebenen Geometrie, ein zweiter Aufrufer mit
 *  anderen Maßen bekäme sonst still die fremde Sparkline. */
function tileKey(id: string, d: ChartDims): string {
  return `${id}|${d.width}x${d.height}+${d.padding}`;
}

function tileFor(cache: HealthCache, id: string, sparkDims: ChartDims): TileVM {
  let byKey = tileMemo.get(cache);
  if (!byKey) { byKey = new Map(); tileMemo.set(cache, byKey); }
  const key = tileKey(id, sparkDims);
  const hit = byKey.get(key);
  if (hit) return hit;
  const tile = computeTile(cache, id, sparkDims);
  byKey.set(key, tile);
  return tile;
}

function computeTile(cache: HealthCache, id: string, sparkDims: ChartDims): TileVM {
  const series = cache.metrics[id];
  const info = describeMetric(id, series.policy);
  const range = cache.dateRange ?? { from: "0000-01-01", to: "9999-12-31" };
  const r = resolveRange("all", range);
  const points = rollupDaily(series.daily, series.policy, r);
  const stats = computeStats(series.daily, series.policy, r);
  const headline = series.policy === "measure" ? stats.avg ?? 0 : stats.avgPerDay ?? 0;
  return {
    id, name: info.name, category: info.category,
    valueText: formatByPolicy(headline, series.unit, series.policy),
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
    return {
      id: metricId, name: metricId, unit: "", empty: true, rangeLabel: "",
      chart: buildChartGeometry([], "line", dims), stats: [],
      axis: EMPTY_AXIS, table: EMPTY_TABLE,
    };
  }
  const info = describeMetric(metricId, series.policy);
  const r = resolveRange(range, cache.dateRange);
  const points = rollupDaily(series.daily, series.policy, r);
  const chart = buildChartGeometry(points, info.chartKind, dims, { granularity: r.granularity });
  // Die Prozentumrechnung passiert hier, damit die Obsidian-Schicht keine
  // Koordinatenrechnung enthält. Die Wochenlinien bleiben bewusst außen vor:
  // sie werden IM SVG gezeichnet und brauchen viewBox-Einheiten.
  const axis: AxisVM = {
    x: chart.xTicks.map((tick) => ({
      leftPct: (tick.x / dims.width) * 100,
      label: formatTickLabel(points[tick.i].key, r.granularity),
    })),
    y: chart.yTicks.map((tick) => ({
      topPct: (tick.y / dims.height) * 100,
      label: formatByPolicy(tick.value, "", series.policy),
    })),
  };
  const table = buildTable(points, series.policy, series.unit, r.granularity);
  const s = computeStats(series.daily, series.policy, r);
  const stats: StatRow[] = series.policy === "measure"
    ? [
        { label: t("stat.avg"), value: s.avg !== undefined ? formatByPolicy(s.avg, series.unit, series.policy) : "—" },
        { label: t("stat.min"), value: s.min !== undefined ? formatByPolicy(s.min, series.unit, series.policy) : "—" },
        { label: t("stat.max"), value: s.max !== undefined ? formatByPolicy(s.max, series.unit, series.policy) : "—" },
        { label: t("stat.last"), value: s.last !== undefined ? formatByPolicy(s.last, series.unit, series.policy) : "—" },
      ]
    : [
        { label: t("stat.avgPerDay"), value: s.avgPerDay !== undefined ? formatByPolicy(s.avgPerDay, series.unit, series.policy) : "—" },
        { label: t("stat.maxDay"), value: s.maxDay !== undefined ? formatByPolicy(s.maxDay, series.unit, series.policy) : "—" },
        { label: t("stat.total"), value: s.total !== undefined ? formatByPolicy(s.total, series.unit, series.policy) : "—" },
      ];
  const rangeLabel = points.length ? `${points[0].key} – ${points[points.length - 1].key}` : "";
  return { id: metricId, name: info.name, unit: series.unit, empty: points.length === 0, rangeLabel, chart, stats, axis, table };
}
