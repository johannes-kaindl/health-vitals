import type { RollupPoint, Granularity } from "./rollup";
import type { ChartKind } from "./metric-catalog";

/** Zielzahl der x-Labels. Bewusst niedrig: mehr Labels kollidieren in schmalen
 *  Sidebars, und der Gesamtzeitraum steht ohnehin im Kopf der Detail-Ansicht. */
export const AXIS_TICKS = 5;

export interface ChartDims { width: number; height: number; padding: number; }
export interface GeometryOpts { granularity?: Granularity; }
export interface ChartGeometry {
  kind: ChartKind;
  width: number; height: number;
  polyline: string;
  band: string;
  bars: Array<{ x: number; y: number; w: number; h: number }>;
  yTicks: Array<{ y: number; value: number }>;
  /** Nur Zahlen, keine Texte — das View-Model holt den Schlüssel über `i`. */
  xTicks: Array<{ i: number; x: number }>;
  weekMarks: number[];
}

/** Montag = 1 nach getUTCDay(). Der Key ist UTC-Mitternacht; ohne das "T00:00:00Z"
 *  interpretiert Node ihn zonenabhängig und der Wochentag kippt. */
function isMonday(key: string): boolean {
  return new Date(`${key}T00:00:00Z`).getUTCDay() === 1;
}

export function buildChartGeometry(
  points: RollupPoint[], kind: ChartKind, dims: ChartDims, opts?: GeometryOpts,
): ChartGeometry {
  const { width, height, padding } = dims;
  const empty: ChartGeometry = {
    kind, width, height, polyline: "", band: "", bars: [], yTicks: [], xTicks: [], weekMarks: [],
  };
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

  // Achsendaten entstehen nur auf Anfrage. Sparklines rufen dreiargumentig auf und
  // bekommen dieselbe Geometrie wie bisher — das hält die Übersicht unberührt.
  const g = opts?.granularity;
  const slotW = innerW / n;
  const tickX = (i: number): number => (kind === "bar" ? padding + i * slotW + slotW / 2 : scaleX(i));
  const xTicks: Array<{ i: number; x: number }> = [];
  const weekMarks: number[] = [];
  if (g) {
    const step = Math.max(1, Math.ceil(n / AXIS_TICKS));
    for (let i = 0; i < n; i += step) xTicks.push({ i, x: tickX(i) });
    if (g === "day") {
      for (let i = 0; i < n; i++) {
        // Der Strich grenzt die Woche ab, markiert also den Anfang des Montags-Slots
        // und nicht dessen Mitte — sonst steht er auf dem Balken statt vor ihm.
        if (isMonday(points[i].key)) weekMarks.push(kind === "bar" ? padding + i * slotW : scaleX(i));
      }
    }
  }

  if (kind === "bar") {
    const barW = slotW * 0.8;
    const base = scaleY(lo);
    const bars = points.map((p, i) => {
      const x = padding + i * slotW + slotW * 0.1;
      const y = scaleY(p.value);
      return { x, y, w: barW, h: Math.max(0, base - y) };
    });
    return { kind, width, height, polyline: "", band: "", bars, yTicks, xTicks, weekMarks };
  }

  const polyline = points.map((p, i) => `${scaleX(i)},${scaleY(p.value)}`).join(" ");
  let band = "";
  if (points.some((p) => p.min !== undefined && p.max !== undefined)) {
    const top = points.map((p, i) => `${scaleX(i)},${scaleY(p.max ?? p.value)}`);
    const bottom = points.map((p, i) => `${scaleX(i)},${scaleY(p.min ?? p.value)}`).reverse();
    band = [...top, ...bottom].join(" ");
  }
  return { kind, width, height, polyline, band, bars: [], yTicks, xTicks, weekMarks };
}
