import type { RollupPoint, Granularity } from "./rollup";
import type { ChartKind } from "./metric-catalog";
import { STAGE_ORDER, type StageKey, type StagePoint } from "./sleep-stages";

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

/**
 * x-Ticks und Wochenlinien — geteilt zwischen Linien-/Balken- und Stapel-Chart.
 * Beide Formen unterscheiden sich nur darin, WO im Slot ein Tick bzw. eine
 * Wochenlinie sitzt; die Auswahl der Indizes ist dieselbe. Stünde sie zweimal da,
 * driftete die eine Kopie beim nächsten Eingriff von der anderen weg.
 */
function buildAxisMarks(
  keys: readonly string[], g: Granularity | undefined,
  tickX: (i: number) => number, markX: (i: number) => number,
): { xTicks: Array<{ i: number; x: number }>; weekMarks: number[] } {
  const xTicks: Array<{ i: number; x: number }> = [];
  const weekMarks: number[] = [];
  if (!g) return { xTicks, weekMarks };
  const step = Math.max(1, Math.ceil(keys.length / AXIS_TICKS));
  for (let i = 0; i < keys.length; i += step) xTicks.push({ i, x: tickX(i) });
  if (g === "day") {
    for (let i = 0; i < keys.length; i++) if (isMonday(keys[i])) weekMarks.push(markX(i));
  }
  return { xTicks, weekMarks };
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
  const slotW = innerW / n;
  // Der Strich grenzt die Woche ab, markiert also den Anfang des Montags-Slots
  // und nicht dessen Mitte — sonst steht er auf dem Balken statt vor ihm.
  const { xTicks, weekMarks } = buildAxisMarks(
    points.map((p) => p.key), opts?.granularity,
    (i) => (kind === "bar" ? padding + i * slotW + slotW / 2 : scaleX(i)),
    (i) => (kind === "bar" ? padding + i * slotW : scaleX(i)),
  );

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

// ---------------------------------------------------------------------------
// Zweite Serie über der ersten (Vergleich zweier Metriken)
// ---------------------------------------------------------------------------

export interface OverlayGeometry {
  /** Zusammenhängende Abschnitte als `x,y x,y …`; eine Lücke (kein Wert in diesem Bucket) trennt
   *  zwei Abschnitte, statt über sie hinwegzuzeichnen — die Linie würde sonst Werte behaupten. */
  segments: string[];
  /** Eine Marke je vorhandenem Wert: Das Strichmuster der Linie und die Marken tragen die
   *  Unterscheidung von der ersten Serie, nicht allein die Farbe. */
  markers: Array<{ x: number; y: number; value: number }>;
  /** Eigene Skala, unabhängig von der ersten Serie (die Einheiten sind fast nie vergleichbar). */
  yTicks: Array<{ y: number; value: number }>;
}

/**
 * Legt eine zweite Serie als Linie über das Chart der ersten. Die x-Positionen sind die der
 * ersten Serie (`primary`: dieselben Buckets, dieselbe Rechnung wie `buildChartGeometry`, bei
 * Balken die Slot-Mitte), die y-Skala ist ihre eigene. `second` ist nach dem Bucket-Schlüssel
 * ausgerichtet; fehlt ein Bucket, entsteht eine Lücke.
 */
export function buildOverlayGeometry(
  primary: RollupPoint[], primaryKind: ChartKind, second: RollupPoint[], dims: ChartDims,
): OverlayGeometry {
  const empty: OverlayGeometry = { segments: [], markers: [], yTicks: [] };
  if (primary.length === 0) return empty;
  const byKey = new Map(second.map((p) => [p.key, p.value]));
  const values = primary.map((p) => byKey.get(p.key));
  const present = values.filter((v): v is number => v !== undefined);
  if (present.length === 0) return empty;

  const { width, height, padding } = dims;
  let lo = Math.min(...present);
  let hi = Math.max(...present);
  if (lo === hi) { lo -= 1; hi += 1; }
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const n = primary.length;
  const slotW = innerW / n;
  const x = (i: number): number =>
    primaryKind === "bar" ? padding + i * slotW + slotW / 2 : padding + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (v: number): number => padding + innerH * (1 - (v - lo) / (hi - lo));

  const segments: string[] = [];
  const markers: OverlayGeometry["markers"] = [];
  let run: string[] = [];
  values.forEach((v, i) => {
    if (v === undefined) {
      if (run.length > 0) { segments.push(run.join(" ")); run = []; }
      return;
    }
    run.push(`${x(i)},${y(v)}`);
    markers.push({ x: x(i), y: y(v), value: v });
  });
  if (run.length > 0) segments.push(run.join(" "));
  const yTicks = [lo, (lo + hi) / 2, hi].map((value) => ({ y: y(value), value }));
  return { segments, markers, yTicks };
}

// ---------------------------------------------------------------------------
// Gestapelte Balken (Schlafphasen)
// ---------------------------------------------------------------------------

export interface StackSegment {
  stage: StageKey;
  x: number; y: number; w: number; h: number;
  /** Der zugrunde liegende Wert in Minuten — fuer Tooltips, damit niemand ihn
   *  aus der Pixelhoehe zurueckrechnen muss. */
  minutes: number;
}
export interface StackGeometry {
  width: number; height: number;
  stacks: Array<{ i: number; segments: StackSegment[] }>;
  yTicks: Array<{ y: number; value: number }>;
  xTicks: Array<{ i: number; x: number }>;
  weekMarks: number[];
}

/**
 * Ein Balken je Punkt, dessen Segmente von unten nach oben in `STAGE_ORDER` stehen.
 * Anders als `buildChartGeometry` skaliert das immer gegen 0 als Grundlinie: Die
 * Balkenhöhe IST die Schlafdauer, eine abgeschnittene Achse würde die Aussage
 * „kurze Nacht" in „etwas weniger Tiefschlaf" verwandeln.
 */
export function buildStackGeometry(
  points: StagePoint[], dims: ChartDims, opts?: GeometryOpts,
): StackGeometry {
  const { width, height, padding } = dims;
  if (points.length === 0) {
    return { width, height, stacks: [], yTicks: [], xTicks: [], weekMarks: [] };
  }

  const totals = points.map((p) => STAGE_ORDER.reduce((sum, s) => sum + p.stages[s], 0));
  const hi = Math.max(...totals) || 1; // ausschließlich 0-Stapel: künstliche Spanne statt /0
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  const n = points.length;
  const slotW = innerW / n;
  const scaleY = (v: number): number => padding + innerH * (1 - v / hi);

  const stacks = points.map((p, i) => {
    const x = padding + i * slotW + slotW * 0.1;
    const w = slotW * 0.8;
    let acc = 0;
    const segments: StackSegment[] = [];
    for (const stage of STAGE_ORDER) {
      const v = p.stages[stage];
      // Ein 0-hohes Rect ist im SVG unsichtbar, im DOM aber vorhanden — es würde
      // in Tooltips und Legendenzählungen als vorhandene Phase mitlaufen.
      if (v <= 0) continue;
      const yTop = scaleY(acc + v);
      segments.push({ stage, x, y: yTop, w, h: scaleY(acc) - yTop, minutes: v });
      acc += v;
    }
    return { i, segments };
  });

  const yTicks = [0, hi / 2, hi].map((value) => ({ y: scaleY(value), value }));
  const { xTicks, weekMarks } = buildAxisMarks(
    points.map((p) => p.key), opts?.granularity,
    (i) => padding + i * slotW + slotW / 2,
    (i) => padding + i * slotW,
  );
  return { width, height, stacks, yTicks, xTicks, weekMarks };
}
