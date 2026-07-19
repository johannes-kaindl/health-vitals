import type { RollupPoint } from "./rollup";
import type { ChartKind } from "./metric-catalog";

export interface ChartDims { width: number; height: number; padding: number; }
export interface ChartGeometry {
  kind: ChartKind;
  width: number; height: number;
  polyline: string;
  band: string;
  bars: Array<{ x: number; y: number; w: number; h: number }>;
  yTicks: Array<{ y: number; value: number }>;
}

export function buildChartGeometry(points: RollupPoint[], kind: ChartKind, dims: ChartDims): ChartGeometry {
  const { width, height, padding } = dims;
  const empty: ChartGeometry = { kind, width, height, polyline: "", band: "", bars: [], yTicks: [] };
  if (points.length === 0) return empty;

  const values = points.map((p) => p.value);
  const mins = points.map((p) => p.min ?? p.value);
  const maxs = points.map((p) => p.max ?? p.value);
  let lo = Math.min(...values, ...mins);
  let hi = Math.max(...values, ...maxs);
  if (kind === "bar") lo = Math.min(lo, 0); // Balken relativ zur 0-Basislinie (bzw. lo)
  if (lo === hi) { lo -= 1; hi += 1; }       // konstante Serie: künstliche Spanne, kein /0

  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const n = points.length;
  const scaleX = (i: number): number => padding + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const scaleY = (v: number): number => padding + innerH * (1 - (v - lo) / (hi - lo));

  const yTicks = [lo, (lo + hi) / 2, hi].map((value) => ({ y: scaleY(value), value }));

  if (kind === "bar") {
    const slotW = innerW / n;
    const barW = slotW * 0.8;
    const base = scaleY(lo);
    const bars = points.map((p, i) => {
      const x = padding + i * slotW + slotW * 0.1;
      const y = scaleY(p.value);
      return { x, y, w: barW, h: Math.max(0, base - y) };
    });
    return { kind, width, height, polyline: "", band: "", bars, yTicks };
  }

  const polyline = points.map((p, i) => `${scaleX(i)},${scaleY(p.value)}`).join(" ");
  let band = "";
  if (points.some((p) => p.min !== undefined && p.max !== undefined)) {
    const top = points.map((p, i) => `${scaleX(i)},${scaleY(p.max ?? p.value)}`);
    const bottom = points.map((p, i) => `${scaleX(i)},${scaleY(p.min ?? p.value)}`).reverse();
    band = [...top, ...bottom].join(" ");
  }
  return { kind, width, height, polyline, band, bars: [], yTicks };
}
