# Dashboard-UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein `ItemView`-Dashboard, das `health-cache.json` lazy lädt und Apple-Health-Metriken als Übersicht-Kacheln → Detail-Zeitreihe (Hand-SVG) rendert.

**Architecture:** Pure Core (`src/core/`, dep-frei, Node-testbar) berechnet Katalog, Rollup, Chart-Geometrie, Stats und ViewModels; der Obsidian-Layer (`src/obsidian/`) rendert daraus SVG via `createSvg` und hält den View-State. Render-Hybrid: Tabs mount-once, Tab-Inhalt ViewModel-Re-Render.

**Tech Stack:** TypeScript, Obsidian Plugin API (`ItemView`, `createSvg`), vitest (globals, node-env), esbuild. Keine neue Runtime-Dependency (kein Chart-Lib).

## Global Constraints

- **UI-STANDARD (obsidian-plugins/UI-STANDARD.md):** DOM **nur** via `createEl`/`createDiv`/`createSpan`/`createSvg` — **nie** `innerHTML`/`outerHTML`. Nur Obsidian-Theme-Variablen, kein `#hex`/`rgb()`, kein `!important`.
- **CSS-Präfix:** alle eigenen Klassen `ah-…` (z.B. `.ah-tile`, `.ah-chart`).
- **Pure/Obsidian-Trennung (AGENTS.md PROF-OBS-03/04):** `src/core/` importiert **nie** `obsidian`.
- **obsidian-Mock lebt außerhalb `src/`** (`tests/__mocks__/obsidian.ts`, via `vitest resolve.alias`, PROF-OBS-08) — nie in `tsconfig.json`.
- **Buttons:** Primär `mod-cta`, destruktiv `mod-warning`; Icon-only trägt `aria-label`.
- **Test-Konvention:** vitest globals (`describe/it/expect`), Tests unter `tests/core/` bzw. `tests/obsidian/`, spiegeln den `src/`-Pfad. Lauf: `npm test`.
- **Manueller Smoke-Test mandatory** (LESSONS.md 2026-07-19): renderer-only-Code (SVG/`ItemView`) ist in Node-Tests unsichtbar.
- Cache-Typen aus `src/core/types.ts`: `HealthCache`, `MetricSeries`, `DayBucket` (`SumBucket{sum,count}` | `MeasureBucket{min,max,avg,count}` | `DurationBucket{minutes,count}`), `Policy` (`"sum"|"measure"|"duration"`).

---

## Task 1: `metric-catalog.ts` (pure)

**Files:**
- Create: `src/core/metric-catalog.ts`
- Test: `tests/core/metric-catalog.test.ts`

**Interfaces:**
- Consumes: `Policy` from `src/core/aggregation-policy.ts`.
- Produces:
  ```ts
  export type Category = "Aktivität" | "Herz" | "Körper" | "Schlaf" | "Ernährung" | "Sonstige";
  export type ChartKind = "line" | "bar";
  export interface MetricInfo { name: string; category: Category; chartKind: ChartKind; }
  export function describeMetric(id: string, policy: Policy): MetricInfo;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/metric-catalog.test.ts
import { describeMetric } from "../../src/core/metric-catalog";

describe("metric-catalog", () => {
  it("kennt kuratierte Identifier mit deutschem Namen + Kategorie", () => {
    expect(describeMetric("HKQuantityTypeIdentifierStepCount", "sum"))
      .toEqual({ name: "Schritte", category: "Aktivität", chartKind: "bar" });
    expect(describeMetric("HKQuantityTypeIdentifierBodyMass", "measure"))
      .toEqual({ name: "Gewicht", category: "Körper", chartKind: "line" });
  });

  it("leitet chartKind aus der Policy ab, wenn der Katalog keinen Override hat", () => {
    // measure → line, sum/duration → bar
    expect(describeMetric("HKQuantityTypeIdentifierHeartRate", "measure").chartKind).toBe("line");
    expect(describeMetric("HKCategoryTypeIdentifierMindfulSession", "duration").chartKind).toBe("bar");
  });

  it("Fallback für Unbekannte: Prefix strippen, CamelCase splitten, Kategorie Sonstige", () => {
    expect(describeMetric("HKQuantityTypeIdentifierDietaryZinc", "measure"))
      .toEqual({ name: "Dietary Zinc", category: "Sonstige", chartKind: "line" });
    expect(describeMetric("HKCategoryTypeIdentifierFooBar", "duration"))
      .toEqual({ name: "Foo Bar", category: "Sonstige", chartKind: "bar" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/metric-catalog.test.ts`
Expected: FAIL — `describeMetric` not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/metric-catalog.ts
import type { Policy } from "./aggregation-policy";

export type Category = "Aktivität" | "Herz" | "Körper" | "Schlaf" | "Ernährung" | "Sonstige";
export type ChartKind = "line" | "bar";
export interface MetricInfo { name: string; category: Category; chartKind: ChartKind; }

interface CatalogEntry { name: string; category: Category; chartKind?: ChartKind; }

// Kuratierter deutscher Katalog der häufigen Identifier. Unbekannte → Fallback (s.u.).
const CATALOG: Record<string, CatalogEntry> = {
  HKQuantityTypeIdentifierStepCount: { name: "Schritte", category: "Aktivität" },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { name: "Gehstrecke", category: "Aktivität" },
  HKQuantityTypeIdentifierDistanceCycling: { name: "Radstrecke", category: "Aktivität" },
  HKQuantityTypeIdentifierFlightsClimbed: { name: "Etagen", category: "Aktivität" },
  HKQuantityTypeIdentifierActiveEnergyBurned: { name: "Aktive Energie", category: "Aktivität" },
  HKQuantityTypeIdentifierBasalEnergyBurned: { name: "Ruheenergie", category: "Aktivität" },
  HKQuantityTypeIdentifierAppleExerciseTime: { name: "Bewegungsminuten", category: "Aktivität" },
  HKQuantityTypeIdentifierAppleStandTime: { name: "Stehminuten", category: "Aktivität" },
  HKQuantityTypeIdentifierHeartRate: { name: "Puls", category: "Herz" },
  HKQuantityTypeIdentifierRestingHeartRate: { name: "Ruhepuls", category: "Herz" },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: { name: "Geh-Puls Ø", category: "Herz" },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { name: "HRV", category: "Herz" },
  HKQuantityTypeIdentifierOxygenSaturation: { name: "Sauerstoffsättigung", category: "Herz" },
  HKQuantityTypeIdentifierBodyMass: { name: "Gewicht", category: "Körper" },
  HKQuantityTypeIdentifierBodyMassIndex: { name: "BMI", category: "Körper" },
  HKQuantityTypeIdentifierBodyFatPercentage: { name: "Körperfett", category: "Körper" },
  HKQuantityTypeIdentifierHeight: { name: "Größe", category: "Körper" },
  HKQuantityTypeIdentifierBodyTemperature: { name: "Körpertemperatur", category: "Körper" },
  HKCategoryTypeIdentifierSleepAnalysis: { name: "Schlaf", category: "Schlaf" },
  HKCategoryTypeIdentifierMindfulSession: { name: "Achtsamkeit", category: "Schlaf" },
  HKQuantityTypeIdentifierDietaryWater: { name: "Wasser", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryEnergyConsumed: { name: "Kalorien", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryProtein: { name: "Protein", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryCarbohydrates: { name: "Kohlenhydrate", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryFatTotal: { name: "Fett", category: "Ernährung" },
};

function chartFromPolicy(policy: Policy): ChartKind {
  return policy === "measure" ? "line" : "bar";
}

function fallbackName(id: string): string {
  const stripped = id
    .replace(/^HKQuantityTypeIdentifier/, "")
    .replace(/^HKCategoryTypeIdentifier/, "")
    .replace(/^HKDataTypeIdentifier/, "");
  // CamelCase → Wörter: "DietaryZinc" → "Dietary Zinc"
  return stripped.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || id;
}

export function describeMetric(id: string, policy: Policy): MetricInfo {
  const entry = CATALOG[id];
  if (entry) {
    return { name: entry.name, category: entry.category, chartKind: entry.chartKind ?? chartFromPolicy(policy) };
  }
  return { name: fallbackName(id), category: "Sonstige", chartKind: chartFromPolicy(policy) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/metric-catalog.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/metric-catalog.ts tests/core/metric-catalog.test.ts
git commit -m "feat(core): metric catalog with German names + policy-derived chartKind"
```

---

## Task 2: `rollup.ts` (pure)

**Files:**
- Create: `src/core/rollup.ts`
- Test: `tests/core/rollup.test.ts`

**Interfaces:**
- Consumes: `DayBucket`, `Policy` from `src/core/types.ts`.
- Produces:
  ```ts
  export type Granularity = "day" | "week" | "month";
  export type RangeKey = "1M" | "3M" | "1J" | "all";
  export interface RollupPoint { key: string; value: number; min?: number; max?: number; }
  export interface ResolvedRange { from: string; to: string; granularity: Granularity; }
  export function resolveRange(range: RangeKey, dateRange: { from: string; to: string }): ResolvedRange;
  export function rollupDaily(
    daily: Record<string, DayBucket>, policy: Policy, r: ResolvedRange,
  ): RollupPoint[];
  ```
  `value` ist der geplottete Wert: `sum`→Summe, `duration`→Minuten-Summe, `measure`→count-gewichteter Ø. `min`/`max` nur bei `measure`. Rückgabe **aufsteigend nach `key`** sortiert.

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/rollup.test.ts
import { resolveRange, rollupDaily } from "../../src/core/rollup";
import type { DayBucket } from "../../src/core/types";

describe("resolveRange", () => {
  const dr = { from: "2017-07-08", to: "2026-07-18" };
  it("1M/3M → Tage, anchored an dateRange.to", () => {
    expect(resolveRange("1M", dr)).toEqual({ from: "2026-06-18", to: "2026-07-18", granularity: "day" });
    expect(resolveRange("3M", dr).granularity).toBe("day");
  });
  it("1J → Wochen, all → Monate über den vollen Bereich", () => {
    expect(resolveRange("1J", dr)).toEqual({ from: "2025-07-18", to: "2026-07-18", granularity: "week" });
    expect(resolveRange("all", dr)).toEqual({ from: "2017-07-08", to: "2026-07-18", granularity: "month" });
  });
});

describe("rollupDaily", () => {
  it("sum: summiert je Bucket, filtert auf Range, sortiert", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { sum: 10, count: 1 },
      "2026-01-15": { sum: 5, count: 1 },
      "2025-12-31": { sum: 99, count: 1 }, // außerhalb Range
    };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };
    expect(rollupDaily(daily, "sum", r)).toEqual([{ key: "2026-01", value: 15 }]);
  });

  it("measure: count-gewichteter Ø, min/max propagiert", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { min: 50, max: 70, avg: 60, count: 2 },
      "2026-01-02": { min: 40, max: 80, avg: 60, count: 8 },
    };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };
    const [pt] = rollupDaily(daily, "measure", r);
    expect(pt.key).toBe("2026-01");
    expect(pt.value).toBe(60); // (60*2 + 60*8)/10
    expect(pt.min).toBe(40);
    expect(pt.max).toBe(80);
  });

  it("week: ISO-Woche über Monatsgrenze bündelt korrekt", () => {
    // 2025-12-29 (Mo) .. 2026-01-04 (So) = ISO-Woche 2026-W01
    const daily: Record<string, DayBucket> = {
      "2025-12-29": { sum: 1, count: 1 },
      "2026-01-04": { sum: 2, count: 1 },
    };
    const r = { from: "2025-12-01", to: "2026-01-31", granularity: "week" as const };
    const pts = rollupDaily(daily, "sum", r);
    expect(pts).toEqual([{ key: "2026-W01", value: 3 }]);
  });

  it("duration: summiert Minuten je Tag-Bucket", () => {
    const daily: Record<string, DayBucket> = { "2026-01-01": { minutes: 420, count: 3 } };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "day" as const };
    expect(rollupDaily(daily, "duration", r)).toEqual([{ key: "2026-01-01", value: 420 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/rollup.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/rollup.ts
import type { DayBucket, MeasureBucket, Policy, SumBucket, DurationBucket } from "./types";

export type Granularity = "day" | "week" | "month";
export type RangeKey = "1M" | "3M" | "1J" | "all";
export interface RollupPoint { key: string; value: number; min?: number; max?: number; }
export interface ResolvedRange { from: string; to: string; granularity: Granularity; }

function minusMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 - months, d));
  return dt.toISOString().slice(0, 10);
}

export function resolveRange(range: RangeKey, dateRange: { from: string; to: string }): ResolvedRange {
  const to = dateRange.to;
  switch (range) {
    case "1M": return { from: minusMonths(to, 1), to, granularity: "day" };
    case "3M": return { from: minusMonths(to, 3), to, granularity: "day" };
    case "1J": return { from: minusMonths(to, 12), to, granularity: "week" };
    case "all": return { from: dateRange.from, to, granularity: "month" };
  }
}

function isoWeekKey(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7; // Mo=0
  dt.setUTCDate(dt.getUTCDate() - day + 3); // Donnerstag der Woche
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstThuDay = (firstThu.getUTCDay() + 6) % 7;
  const week = 1 + Math.round(((dt.getTime() - firstThu.getTime()) / 86400000 - 3 + firstThuDay) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function bucketKey(day: string, g: Granularity): string {
  if (g === "day") return day;
  if (g === "month") return day.slice(0, 7);
  return isoWeekKey(day);
}

interface Acc { sum: number; wSum: number; count: number; min: number; max: number; }

export function rollupDaily(daily: Record<string, DayBucket>, policy: Policy, r: ResolvedRange): RollupPoint[] {
  const buckets = new Map<string, Acc>();
  for (const day of Object.keys(daily)) {
    if (day < r.from || day > r.to) continue;
    const key = bucketKey(day, r.granularity);
    let acc = buckets.get(key);
    if (!acc) { acc = { sum: 0, wSum: 0, count: 0, min: Infinity, max: -Infinity }; buckets.set(key, acc); }
    const b = daily[day];
    if (policy === "sum") {
      acc.sum += (b as SumBucket).sum;
    } else if (policy === "duration") {
      acc.sum += (b as DurationBucket).minutes;
    } else {
      const mb = b as MeasureBucket;
      acc.wSum += mb.avg * mb.count;
      acc.count += mb.count;
      acc.min = Math.min(acc.min, mb.min);
      acc.max = Math.max(acc.max, mb.max);
    }
  }
  const out: RollupPoint[] = [];
  for (const [key, acc] of buckets) {
    if (policy === "measure") {
      out.push({ key, value: acc.count ? acc.wSum / acc.count : 0, min: acc.min, max: acc.max });
    } else {
      out.push({ key, value: acc.sum });
    }
  }
  out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/rollup.test.ts`
Expected: PASS (6 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/rollup.ts tests/core/rollup.test.ts
git commit -m "feat(core): policy-correct daily rollup (day/week/month) + range resolver"
```

---

## Task 3: `chart-geometry.ts` (pure)

**Files:**
- Create: `src/core/chart-geometry.ts`
- Test: `tests/core/chart-geometry.test.ts`

**Interfaces:**
- Consumes: `RollupPoint` from `src/core/rollup.ts`, `ChartKind` from `src/core/metric-catalog.ts`.
- Produces:
  ```ts
  export interface ChartDims { width: number; height: number; padding: number; }
  export interface ChartGeometry {
    kind: ChartKind;
    width: number; height: number;
    polyline: string;                                   // "" wenn keine Punkte / kind=bar
    band: string;                                       // Polygon-Punkte (measure min/max), sonst ""
    bars: Array<{ x: number; y: number; w: number; h: number }>;
    yTicks: Array<{ y: number; value: number }>;
  }
  export function buildChartGeometry(points: RollupPoint[], kind: ChartKind, dims: ChartDims): ChartGeometry;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/chart-geometry.test.ts
import { buildChartGeometry } from "../../src/core/chart-geometry";
import type { RollupPoint } from "../../src/core/rollup";

const dims = { width: 100, height: 50, padding: 5 };

describe("chart-geometry", () => {
  it("leere Serie → leere Geometrie, kein Absturz", () => {
    const g = buildChartGeometry([], "line", dims);
    expect(g.polyline).toBe("");
    expect(g.bars).toEqual([]);
    expect(g.yTicks).toEqual([]);
  });

  it("konstante Werte → keine Division durch 0, Punkte im Rahmen", () => {
    const pts: RollupPoint[] = [{ key: "a", value: 5 }, { key: "b", value: 5 }];
    const g = buildChartGeometry(pts, "line", dims);
    // beide y liegen im [padding, height-padding]
    const ys = g.polyline.split(" ").map((p) => Number(p.split(",")[1]));
    for (const y of ys) { expect(y).toBeGreaterThanOrEqual(5); expect(y).toBeLessThanOrEqual(45); }
    expect(ys).toHaveLength(2);
  });

  it("line: erster Punkt links (x=padding), letzter rechts (x=width-padding)", () => {
    const pts: RollupPoint[] = [{ key: "a", value: 0 }, { key: "b", value: 10 }];
    const g = buildChartGeometry(pts, "line", dims);
    const xs = g.polyline.split(" ").map((p) => Number(p.split(",")[0]));
    expect(xs[0]).toBeCloseTo(5);
    expect(xs[xs.length - 1]).toBeCloseTo(95);
  });

  it("measure mit min/max → band-Polygon nicht leer", () => {
    const pts: RollupPoint[] = [
      { key: "a", value: 5, min: 2, max: 8 },
      { key: "b", value: 6, min: 3, max: 9 },
    ];
    const g = buildChartGeometry(pts, "line", dims);
    expect(g.band.length).toBeGreaterThan(0);
  });

  it("bar: ein Rect pro Punkt, innerhalb der Breite", () => {
    const pts: RollupPoint[] = [{ key: "a", value: 3 }, { key: "b", value: 7 }];
    const g = buildChartGeometry(pts, "bar", dims);
    expect(g.bars).toHaveLength(2);
    for (const b of g.bars) { expect(b.x).toBeGreaterThanOrEqual(5); expect(b.x + b.w).toBeLessThanOrEqual(95); }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/chart-geometry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/chart-geometry.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/chart-geometry.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/chart-geometry.ts tests/core/chart-geometry.test.ts
git commit -m "feat(core): pure SVG chart geometry (line/band/bar, edge-case safe)"
```

---

## Task 4: `series-stats.ts` (pure)

**Files:**
- Create: `src/core/series-stats.ts`
- Test: `tests/core/series-stats.test.ts`

**Interfaces:**
- Consumes: `DayBucket`, `Policy` from `src/core/types.ts`, `ResolvedRange` from `src/core/rollup.ts`.
- Produces:
  ```ts
  export interface SeriesStats {
    policy: Policy;
    avgPerDay?: number; maxDay?: number; total?: number;  // sum/duration
    avg?: number; min?: number; max?: number; last?: number; // measure
  }
  export function computeStats(daily: Record<string, DayBucket>, policy: Policy, r: ResolvedRange): SeriesStats;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/series-stats.test.ts
import { computeStats } from "../../src/core/series-stats";
import type { DayBucket } from "../../src/core/types";

const r = { from: "2026-01-01", to: "2026-01-31", granularity: "day" as const };

describe("series-stats", () => {
  it("sum: total / Ø-pro-Tag-mit-Daten / max-Tag", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { sum: 10, count: 1 },
      "2026-01-02": { sum: 20, count: 1 },
      "2025-12-31": { sum: 99, count: 1 }, // außerhalb
    };
    expect(computeStats(daily, "sum", r)).toEqual({ policy: "sum", total: 30, avgPerDay: 15, maxDay: 20 });
  });

  it("measure: gewichteter Ø, globales min/max, letzter Wert", () => {
    const daily: Record<string, DayBucket> = {
      "2026-01-01": { min: 50, max: 70, avg: 60, count: 1 },
      "2026-01-10": { min: 55, max: 90, avg: 65, count: 1 },
    };
    const s = computeStats(daily, "measure", r);
    expect(s.avg).toBe(62.5);
    expect(s.min).toBe(50);
    expect(s.max).toBe(90);
    expect(s.last).toBe(65); // spätester Tag
  });

  it("duration: Minuten-Summe", () => {
    const daily: Record<string, DayBucket> = { "2026-01-01": { minutes: 400, count: 2 } };
    expect(computeStats(daily, "duration", r)).toEqual({ policy: "duration", total: 400, avgPerDay: 400, maxDay: 400 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/series-stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/series-stats.ts
import type { DayBucket, MeasureBucket, Policy, SumBucket, DurationBucket } from "./types";
import type { ResolvedRange } from "./rollup";

export interface SeriesStats {
  policy: Policy;
  avgPerDay?: number; maxDay?: number; total?: number;
  avg?: number; min?: number; max?: number; last?: number;
}

export function computeStats(daily: Record<string, DayBucket>, policy: Policy, r: ResolvedRange): SeriesStats {
  const days = Object.keys(daily).filter((d) => d >= r.from && d <= r.to).sort();
  if (policy === "measure") {
    let wSum = 0, count = 0, min = Infinity, max = -Infinity;
    for (const d of days) {
      const mb = daily[d] as MeasureBucket;
      wSum += mb.avg * mb.count; count += mb.count;
      min = Math.min(min, mb.min); max = Math.max(max, mb.max);
    }
    const last = days.length ? (daily[days[days.length - 1]] as MeasureBucket).avg : undefined;
    return {
      policy,
      avg: count ? wSum / count : undefined,
      min: days.length ? min : undefined,
      max: days.length ? max : undefined,
      last,
    };
  }
  let total = 0, maxDay = 0;
  for (const d of days) {
    const v = policy === "sum" ? (daily[d] as SumBucket).sum : (daily[d] as DurationBucket).minutes;
    total += v; maxDay = Math.max(maxDay, v);
  }
  return {
    policy,
    total,
    avgPerDay: days.length ? total / days.length : undefined,
    maxDay: days.length ? maxDay : undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/series-stats.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/series-stats.ts tests/core/series-stats.test.ts
git commit -m "feat(core): per-policy series stats over a resolved range"
```

---

## Task 5: `format.ts` + `view-model.ts` (pure)

**Files:**
- Create: `src/core/format.ts`
- Create: `src/core/view-model.ts`
- Test: `tests/core/view-model.test.ts`

**Interfaces:**
- Consumes: `HealthCache` (`src/core/types.ts`), `describeMetric`/`Category` (Task 1), `resolveRange`/`rollupDaily`/`RangeKey` (Task 2), `buildChartGeometry`/`ChartDims`/`ChartGeometry` (Task 3), `computeStats` (Task 4).
- Produces:
  ```ts
  // format.ts
  export function formatValue(n: number, unit: string): string;   // "8.432 count" → de-DE
  // view-model.ts
  export interface TileVM { id: string; name: string; category: Category; valueText: string; spark: ChartGeometry; }
  export interface OverviewVM { favorites: TileVM[]; sections: Array<{ category: Category; tiles: TileVM[] }>; }
  export interface StatRow { label: string; value: string; }
  export interface DetailVM {
    id: string; name: string; unit: string; empty: boolean;
    rangeLabel: string; chart: ChartGeometry; stats: StatRow[];
  }
  export function buildOverviewVM(cache: HealthCache, favorites: string[], sparkDims: ChartDims): OverviewVM;
  export function buildDetailVM(cache: HealthCache, metricId: string, range: RangeKey, dims: ChartDims): DetailVM;
  export const CATEGORY_ORDER: Category[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/view-model.test.ts
import { buildOverviewVM, buildDetailVM } from "../../src/core/view-model";
import type { HealthCache } from "../../src/core/types";

function cache(): HealthCache {
  return {
    version: 1, sourceFile: "x", importedAt: "", recordCount: 3, skippedCount: 0,
    dateRange: { from: "2026-01-01", to: "2026-01-31" },
    metrics: {
      HKQuantityTypeIdentifierStepCount: {
        unit: "count", policy: "sum",
        daily: { "2026-01-01": { sum: 100, count: 1 }, "2026-01-02": { sum: 300, count: 1 } },
      },
      HKQuantityTypeIdentifierBodyMass: {
        unit: "kg", policy: "measure",
        daily: { "2026-01-01": { min: 78, max: 79, avg: 78.5, count: 1 } },
      },
    },
    workouts: [],
  };
}
const dims = { width: 200, height: 80, padding: 6 };

describe("buildOverviewVM", () => {
  it("Favoriten oben, Rest nach Kategorie gruppiert, keine Dubletten", () => {
    const vm = buildOverviewVM(cache(), ["HKQuantityTypeIdentifierBodyMass"], { width: 60, height: 24, padding: 2 });
    expect(vm.favorites.map((t) => t.name)).toEqual(["Gewicht"]);
    const allSection = vm.sections.flatMap((s) => s.tiles.map((t) => t.name));
    expect(allSection).toContain("Schritte");
    expect(allSection).not.toContain("Gewicht"); // Favorit erscheint nicht doppelt
  });
});

describe("buildDetailVM", () => {
  it("liefert Chart + Stats + Range-Label für existierende Metrik", () => {
    const vm = buildDetailVM(cache(), "HKQuantityTypeIdentifierStepCount", "all", dims);
    expect(vm.name).toBe("Schritte");
    expect(vm.empty).toBe(false);
    expect(vm.chart.kind).toBe("bar");
    expect(vm.stats.some((r) => r.label === "Summe")).toBe(true);
  });

  it("empty=true, wenn die Metrik im Range keine Daten hat", () => {
    const vm = buildDetailVM(cache(), "HKQuantityTypeIdentifierStepCount", "1M", dims);
    // Range 1M endet 2026-01-31, from 2025-12-31 → Daten liegen drin → nicht empty.
    // Unbekannte Metrik hingegen → empty:
    const none = buildDetailVM(cache(), "HKQuantityTypeIdentifierUnknownXYZ", "all", dims);
    expect(none.empty).toBe(true);
    expect(vm.empty).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/view-model.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/core/format.ts
export function formatValue(n: number, unit: string): string {
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const num = rounded.toLocaleString("de-DE");
  return unit ? `${num} ${unit}` : num;
}
```

```ts
// src/core/view-model.ts
import type { HealthCache } from "./types";
import { describeMetric, type Category } from "./metric-catalog";
import { resolveRange, rollupDaily, type RangeKey } from "./rollup";
import { buildChartGeometry, type ChartDims, type ChartGeometry } from "./chart-geometry";
import { computeStats } from "./series-stats";
import { formatValue } from "./format";

export interface TileVM { id: string; name: string; category: Category; valueText: string; spark: ChartGeometry; }
export interface OverviewVM { favorites: TileVM[]; sections: Array<{ category: Category; tiles: TileVM[] }>; }
export interface StatRow { label: string; value: string; }
export interface DetailVM {
  id: string; name: string; unit: string; empty: boolean;
  rangeLabel: string; chart: ChartGeometry; stats: StatRow[];
}

export const CATEGORY_ORDER: Category[] = ["Aktivität", "Herz", "Körper", "Schlaf", "Ernährung", "Sonstige"];

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
      tiles: (byCat.get(category) as TileVM[]).sort((a, b) => a.name.localeCompare(b.name, "de")),
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
        { label: "Ø", value: s.avg !== undefined ? formatValue(s.avg, series.unit) : "—" },
        { label: "Min", value: s.min !== undefined ? formatValue(s.min, series.unit) : "—" },
        { label: "Max", value: s.max !== undefined ? formatValue(s.max, series.unit) : "—" },
        { label: "Zuletzt", value: s.last !== undefined ? formatValue(s.last, series.unit) : "—" },
      ]
    : [
        { label: "Ø/Tag", value: s.avgPerDay !== undefined ? formatValue(s.avgPerDay, series.unit) : "—" },
        { label: "Max-Tag", value: s.maxDay !== undefined ? formatValue(s.maxDay, series.unit) : "—" },
        { label: "Summe", value: s.total !== undefined ? formatValue(s.total, series.unit) : "—" },
      ];
  const rangeLabel = points.length ? `${points[0].key} – ${points[points.length - 1].key}` : "";
  return { id: metricId, name: info.name, unit: series.unit, empty: points.length === 0, rangeLabel, chart, stats };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/view-model.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/format.ts src/core/view-model.ts tests/core/view-model.test.ts
git commit -m "feat(core): overview + detail view-models and de-DE value formatting"
```

---

## Task 6: Extend obsidian mock + `chart-render.ts`

**Files:**
- Modify: `tests/__mocks__/obsidian.ts` (add `ItemView`, `WorkspaceLeaf`, `setIcon`, `createSvg` support on mock el)
- Create: `src/obsidian/chart-render.ts`
- Test: `tests/obsidian/chart-render.test.ts`

**Interfaces:**
- Consumes: `ChartGeometry` from `src/core/chart-geometry.ts`.
- Produces:
  ```ts
  export function renderChart(parent: HTMLElement, geom: ChartGeometry, opts?: { axis?: boolean }): void;
  ```
  Baut ausschließlich SVG-Kinder via `parent.createSvg(...)`. Kein `innerHTML`. Klassen `ah-chart*`.

- [ ] **Step 1: Extend the obsidian mock (add SVG + view stubs)**

Add to `tests/__mocks__/obsidian.ts` — inside `makeEl()`'s returned object add a `createSvg` that records tag + attrs, and after the existing exports append view/icon stubs:

```ts
// inside makeEl(), alongside createEl/createDiv:
    createSvg(tag: string, o?: any) {
      const child = makeEl();
      child.tag = tag;
      child.attrs = (o && o.attr) || {};
      child.cls = (o && o.cls) || "";
      el.children.push(child);
      return child;
    },
```

```ts
// appended at end of tests/__mocks__/obsidian.ts:
export class WorkspaceLeaf { view: any; }
export class ItemView {
  containerEl: any = makeEl();
  leaf: any;
  constructor(leaf?: any) { this.leaf = leaf; }
  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  getIcon(): string { return ""; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}
export function setIcon(_el: any, _name: string): void {}
export class ButtonComponent {
  buttonEl: any = makeEl();
  constructor(_el?: any) {}
  setButtonText() { return this; }
  setCta() { return this; }
  setWarning() { return this; }
  setIcon() { return this; }
  setTooltip() { return this; }
  onClick(_cb: any) { return this; }
}
```

Note: the mock el already exposes `children`; `createSvg` children are collected there so tests can assert tag counts.

- [ ] **Step 2: Write the failing test**

```ts
// tests/obsidian/chart-render.test.ts
import { renderChart } from "../../src/obsidian/chart-render";
import { buildChartGeometry } from "../../src/core/chart-geometry";
import type { RollupPoint } from "../../src/core/rollup";

function fakeEl(): any {
  const el: any = { children: [] as any[],
    createSvg(tag: string, o?: any) { const c = fakeEl(); c.tag = tag; c.attrs = (o && o.attr) || {}; el.children.push(c); return c; },
  };
  return el;
}

describe("renderChart", () => {
  it("line: erzeugt ein <svg> mit einer <polyline>", () => {
    const pts: RollupPoint[] = [{ key: "a", value: 1 }, { key: "b", value: 2 }];
    const geom = buildChartGeometry(pts, "line", { width: 100, height: 40, padding: 4 });
    const parent = fakeEl();
    renderChart(parent, geom);
    const svg = parent.children[0];
    expect(svg.tag).toBe("svg");
    const tags = svg.children.map((c: any) => c.tag);
    expect(tags).toContain("polyline");
  });

  it("bar: erzeugt ein <rect> pro Balken", () => {
    const pts: RollupPoint[] = [{ key: "a", value: 3 }, { key: "b", value: 5 }, { key: "c", value: 1 }];
    const geom = buildChartGeometry(pts, "bar", { width: 100, height: 40, padding: 4 });
    const parent = fakeEl();
    renderChart(parent, geom);
    const svg = parent.children[0];
    const rects = svg.children.filter((c: any) => c.tag === "rect");
    expect(rects).toHaveLength(3);
  });

  it("leere Geometrie → kein Absturz, kein polyline/rect", () => {
    const geom = buildChartGeometry([], "line", { width: 100, height: 40, padding: 4 });
    const parent = fakeEl();
    expect(() => renderChart(parent, geom)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/chart-render.test.ts`
Expected: FAIL — `renderChart` module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/obsidian/chart-render.ts
import type { ChartGeometry } from "../core/chart-geometry";

export function renderChart(parent: HTMLElement, geom: ChartGeometry, opts?: { axis?: boolean }): void {
  const svg = parent.createSvg("svg", {
    cls: "ah-chart",
    attr: { viewBox: `0 0 ${geom.width} ${geom.height}`, preserveAspectRatio: "none" },
  });

  if (opts?.axis) {
    for (const t of geom.yTicks) {
      svg.createSvg("line", {
        cls: "ah-chart-grid",
        attr: { x1: 0, y1: t.y, x2: geom.width, y2: t.y },
      });
    }
  }

  if (geom.band) {
    svg.createSvg("polygon", { cls: "ah-chart-band", attr: { points: geom.band } });
  }
  if (geom.polyline) {
    svg.createSvg("polyline", { cls: "ah-chart-line", attr: { points: geom.polyline, fill: "none" } });
  }
  for (const b of geom.bars) {
    svg.createSvg("rect", {
      cls: "ah-chart-bar",
      attr: { x: b.x, y: b.y, width: b.w, height: b.h },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/chart-render.test.ts && npm test`
Expected: PASS (3 neue Tests + alle bestehenden grün — Mock-Erweiterung bricht nichts).

- [ ] **Step 6: Commit**

```bash
git add tests/__mocks__/obsidian.ts src/obsidian/chart-render.ts tests/obsidian/chart-render.test.ts
git commit -m "feat(obsidian): SVG chart renderer via createSvg + mock extensions"
```

---

## Task 7: `DashboardHost` + `dashboard-view.ts` shell

**Files:**
- Create: `src/obsidian/dashboard-view.ts`
- Test: `tests/obsidian/dashboard-view.test.ts`

**Interfaces:**
- Consumes: `HealthCache` (`src/core/types.ts`); tab-renderer functions (Tasks 8–10) `renderOverview`/`renderDetail`/`renderWorkouts` — bis dahin als leere Platzhalter-Renderer importiert. **Reihenfolge-Hinweis:** Task 7 legt die Platzhalter-Dateien `tabs/overview.ts`/`tabs/detail.ts`/`tabs/workouts.ts` mit no-op-Exports an, Tasks 8–10 füllen sie.
- Produces:
  ```ts
  export const VIEW_TYPE_DASHBOARD = "apple-health-dashboard";
  export interface DashboardHost {
    loadCache(): Promise<HealthCache | null>;
    getFavorites(): string[];
    toggleFavorite(id: string): Promise<void>;
    runImport(): void;
  }
  export type TabId = "overview" | "detail" | "workouts";
  export class DashboardView extends ItemView {
    constructor(leaf: WorkspaceLeaf, host: DashboardHost);
    openDetail(metricId: string): void;   // von overview.ts genutzt
  }
  ```

- [ ] **Step 1: Create placeholder tab renderers (filled in later tasks)**

```ts
// src/obsidian/tabs/overview.ts
import type { HealthCache } from "../../core/types";
import type { DashboardView } from "../dashboard-view";
export function renderOverview(_el: HTMLElement, _cache: HealthCache, _view: DashboardView): void {}
```
```ts
// src/obsidian/tabs/detail.ts
import type { HealthCache } from "../../core/types";
import type { RangeKey } from "../../core/rollup";
export interface DetailState { metricId: string | null; range: RangeKey; }
export function renderDetail(_el: HTMLElement, _cache: HealthCache, _state: DetailState, _onState: (s: DetailState) => void): void {}
```
```ts
// src/obsidian/tabs/workouts.ts
import type { HealthCache } from "../../core/types";
export function renderWorkouts(_el: HTMLElement, _cache: HealthCache): void {}
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/obsidian/dashboard-view.test.ts
import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "../../src/obsidian/dashboard-view";
import type { HealthCache } from "../../src/core/types";

function host(cache: HealthCache | null): DashboardHost {
  return {
    loadCache: async () => cache,
    getFavorites: () => [],
    toggleFavorite: async () => {},
    runImport: () => {},
  };
}
const emptyCache: HealthCache = {
  version: 1, sourceFile: "", importedAt: "", recordCount: 0, skippedCount: 0,
  dateRange: { from: "2026-01-01", to: "2026-01-02" }, metrics: {}, workouts: [],
};

describe("DashboardView", () => {
  it("getViewType/getDisplayText gesetzt", () => {
    const v = new DashboardView({} as any, host(emptyCache));
    expect(v.getViewType()).toBe(VIEW_TYPE_DASHBOARD);
    expect(v.getDisplayText().length).toBeGreaterThan(0);
  });

  it("onOpen ohne Cache rendert Empty-State-CTA (ruft runImport nicht von selbst)", async () => {
    let imported = false;
    const v = new DashboardView({} as any, { ...host(null), runImport: () => { imported = true; } });
    await v.onOpen();
    expect(imported).toBe(false); // CTA nur vorhanden, nicht auto-getriggert
  });

  it("onOpen mit Cache wirft nicht", async () => {
    const v = new DashboardView({} as any, host(emptyCache));
    await expect(v.onOpen()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/dashboard-view.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write minimal implementation**

```ts
// src/obsidian/dashboard-view.ts
import { ItemView, WorkspaceLeaf, ButtonComponent } from "obsidian";
import type { HealthCache } from "../core/types";
import type { RangeKey } from "../core/rollup";
import { renderOverview } from "./tabs/overview";
import { renderDetail, type DetailState } from "./tabs/detail";
import { renderWorkouts } from "./tabs/workouts";

export const VIEW_TYPE_DASHBOARD = "apple-health-dashboard";

export interface DashboardHost {
  loadCache(): Promise<HealthCache | null>;
  getFavorites(): string[];
  toggleFavorite(id: string): Promise<void>;
  runImport(): void;
}

export type TabId = "overview" | "detail" | "workouts";
const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "overview", label: "Übersicht", icon: "layout-grid" },
  { id: "detail", label: "Detail", icon: "line-chart" },
  { id: "workouts", label: "Workouts", icon: "dumbbell" },
];

export class DashboardView extends ItemView {
  private host: DashboardHost;
  private cache: HealthCache | null = null;
  private active: TabId = "overview";
  private detail: DetailState = { metricId: null, range: "3M" };
  private panels = new Map<TabId, HTMLElement>();
  private tabButtons = new Map<TabId, HTMLElement>();

  constructor(leaf: WorkspaceLeaf, host: DashboardHost) {
    super(leaf);
    this.host = host;
  }

  getViewType(): string { return VIEW_TYPE_DASHBOARD; }
  getDisplayText(): string { return "Apple Health"; }
  getIcon(): string { return "heart-pulse"; }

  openDetail(metricId: string): void {
    this.detail = { ...this.detail, metricId };
    this.switchTab("detail");
    this.renderActive();
  }

  async onOpen(): Promise<void> {
    this.cache = await this.host.loadCache();
    const root = this.contentEl;
    root.empty();
    root.addClass("ah-dashboard");

    if (!this.cache) { this.renderEmptyState(root); return; }

    const head = root.createDiv({ cls: "ah-tabbar" });
    for (const t of TABS) {
      const btn = head.createDiv({ cls: "ah-tab" });
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", t.label);
      btn.createSpan({ cls: "ah-tab-label", text: t.label });
      btn.addEventListener("click", () => { this.switchTab(t.id); this.renderActive(); });
      this.tabButtons.set(t.id, btn);
    }

    const content = root.createDiv({ cls: "ah-content" });
    for (const t of TABS) {
      const panel = content.createDiv({ cls: "ah-panel" });
      this.panels.set(t.id, panel);
    }
    this.switchTab(this.active);
    this.renderActive();
  }

  private renderEmptyState(root: HTMLElement): void {
    const box = root.createDiv({ cls: "ah-empty" });
    box.createEl("h3", { text: "Noch kein Import" });
    box.createEl("p", { text: "Es wurde noch keine health-cache.json gefunden. Führe zuerst den Import aus." });
    new ButtonComponent(box).setButtonText("Import ausführen").setCta().onClick(() => this.host.runImport());
  }

  private switchTab(id: TabId): void {
    this.active = id;
    for (const [tid, panel] of this.panels) panel.toggleClass("is-hidden", tid !== id);
    for (const [tid, btn] of this.tabButtons) btn.toggleClass("is-active", tid === id);
  }

  // Mount-once: nur der aktive Panel-Inhalt wird (neu) gerendert; State der anderen bleibt im DOM.
  private renderActive(): void {
    if (!this.cache) return;
    const panel = this.panels.get(this.active);
    if (!panel) return;
    panel.empty();
    if (this.active === "overview") {
      renderOverview(panel, this.cache, this);
    } else if (this.active === "detail") {
      renderDetail(panel, this.cache, this.detail, (s) => { this.detail = s; this.renderActive(); });
    } else {
      renderWorkouts(panel, this.cache);
    }
  }

  async onClose(): Promise<void> { this.contentEl.empty(); }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/dashboard-view.test.ts`
Expected: PASS (3 Tests). (`toggleClass`/`setAttribute`/`createSpan` are permissive mock stubs — add them to `makeEl()` in the mock if a test throws: `toggleClass(){}`, `setAttribute(){}`, and ensure `createEl`/`createDiv`/`createSpan` accept an options arg and set `.textContent`/return child.)

- [ ] **Step 6: Extend mock if needed, then commit**

If Step 5 threw on a missing mock method, add the minimal stub to `makeEl()` (e.g. `toggleClass(_c,_v){}`, `setAttribute(){}`, and make `createEl(_t,o){ const c=makeEl(); if(o&&o.text)c.text=o.text; el.children.push(c); return c; }`), rerun `npm test` (all green), then:

```bash
git add src/obsidian/dashboard-view.ts src/obsidian/tabs/ tests/obsidian/dashboard-view.test.ts tests/__mocks__/obsidian.ts
git commit -m "feat(obsidian): dashboard ItemView shell (mount-once tabs, host, empty-state)"
```

---

## Task 8: `tabs/overview.ts` (Favoriten + Kategorie-Sektionen)

**Files:**
- Modify: `src/obsidian/tabs/overview.ts` (replace placeholder)
- Test: `tests/obsidian/overview.test.ts`

**Interfaces:**
- Consumes: `buildOverviewVM`/`TileVM` (Task 5), `renderChart` (Task 6), `DashboardView.openDetail` (Task 7), `DashboardHost.toggleFavorite` via `view`.
- Produces: `export function renderOverview(el: HTMLElement, cache: HealthCache, view: DashboardView): void;`

- [ ] **Step 1: Write the failing test**

```ts
// tests/obsidian/overview.test.ts
import { renderOverview } from "../../src/obsidian/tabs/overview";
import type { HealthCache } from "../../src/core/types";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "",
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(_t: string, o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSvg(tag: string) { const c = fakeEl(); c.tag = tag; el.children.push(c); return c; },
    addEventListener() {}, setAttribute() {}, toggleClass() {}, addClass() {},
  };
  return el;
}
function countClass(el: any, cls: string): number {
  let n = el.cls === cls ? 1 : 0;
  for (const c of el.children) n += countClass(c, cls);
  return n;
}
const cache: HealthCache = {
  version: 1, sourceFile: "", importedAt: "", recordCount: 2, skippedCount: 0,
  dateRange: { from: "2026-01-01", to: "2026-01-31" },
  metrics: {
    HKQuantityTypeIdentifierStepCount: { unit: "count", policy: "sum", daily: { "2026-01-01": { sum: 100, count: 1 } } },
    HKQuantityTypeIdentifierBodyMass: { unit: "kg", policy: "measure", daily: { "2026-01-01": { min: 78, max: 79, avg: 78.5, count: 1 } } },
  },
  workouts: [],
};

describe("renderOverview", () => {
  it("rendert eine Kachel pro Metrik", () => {
    const el = fakeEl();
    const view: any = { getFavoritesForRender: () => [], openDetail() {}, host: { getFavorites: () => [], toggleFavorite: async () => {} } };
    renderOverview(el, cache, view);
    expect(countClass(el, "ah-tile")).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/overview.test.ts`
Expected: FAIL — placeholder renders nichts (0 Kacheln).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/obsidian/tabs/overview.ts
import { setIcon } from "obsidian";
import type { HealthCache } from "../../core/types";
import { buildOverviewVM, type TileVM } from "../../core/view-model";
import { renderChart } from "../chart-render";
import type { DashboardView } from "../dashboard-view";

const SPARK_DIMS = { width: 120, height: 36, padding: 2 };

export function renderOverview(el: HTMLElement, cache: HealthCache, view: DashboardView): void {
  const favorites = view.host.getFavorites();
  const vm = buildOverviewVM(cache, favorites, SPARK_DIMS);

  if (vm.favorites.length) {
    const favSection = el.createDiv({ cls: "ah-fav-section" });
    favSection.createEl("h3", { text: "★ Favoriten" });
    const grid = favSection.createDiv({ cls: "ah-tile-grid" });
    for (const t of vm.favorites) renderTile(grid, t, cache, view, true);
  }

  for (const section of vm.sections) {
    const details = el.createEl("details", { cls: "ah-cat" });
    if (!vm.favorites.length && section === vm.sections[0]) details.setAttribute("open", "");
    const summary = details.createEl("summary", { text: `${section.category} (${section.tiles.length})` });
    summary.addClass("ah-cat-summary");
    const grid = details.createDiv({ cls: "ah-tile-grid" });
    for (const t of section.tiles) renderTile(grid, t, cache, view, false);
  }
}

function renderTile(grid: HTMLElement, t: TileVM, _cache: HealthCache, view: DashboardView, isFav: boolean): void {
  const tile = grid.createDiv({ cls: "ah-tile" });
  tile.setAttribute("role", "button");
  tile.setAttribute("aria-label", `${t.name} öffnen`);
  tile.addEventListener("click", () => view.openDetail(t.id));

  const head = tile.createDiv({ cls: "ah-tile-head" });
  head.createSpan({ cls: "ah-tile-name", text: t.name });
  const star = head.createSpan({ cls: "ah-tile-star" });
  setIcon(star, isFav ? "star" : "star-off");
  star.setAttribute("aria-label", isFav ? "Aus Favoriten entfernen" : "Zu Favoriten");
  star.addEventListener("click", (ev: MouseEvent) => {
    ev.stopPropagation();
    void view.host.toggleFavorite(t.id).then(() => view.refreshOverview());
  });

  tile.createDiv({ cls: "ah-tile-value", text: t.valueText });
  const chartBox = tile.createDiv({ cls: "ah-tile-spark" });
  renderChart(chartBox, t.spark);
}
```

- [ ] **Step 4: Expose host + refreshOverview on the view**

`renderTile` uses `view.host` and `view.refreshOverview()`. Add to `DashboardView` (Task 7 file): make `host` accessible and add a small refresh:

```ts
// in dashboard-view.ts — change `private host` to `readonly host` and add:
  readonly host: DashboardHost;   // was: private host
  refreshOverview(): void { if (this.active === "overview") this.renderActive(); }
```
(Adjust the constructor assignment accordingly; `this.host = host` stays.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/overview.test.ts && npm test`
Expected: PASS (Kachel-Zahl == 2, alle bestehenden Tests grün).

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/tabs/overview.ts src/obsidian/dashboard-view.ts tests/obsidian/overview.test.ts
git commit -m "feat(obsidian): overview tab — favorites + collapsible category tiles with sparklines"
```

---

## Task 9: `tabs/detail.ts` (Range-Presets + Chart + Stats)

**Files:**
- Modify: `src/obsidian/tabs/detail.ts` (replace placeholder)
- Test: `tests/obsidian/detail.test.ts`

**Interfaces:**
- Consumes: `buildDetailVM` (Task 5), `renderChart` (Task 6), `RangeKey` (Task 2), `DetailState` (Task 7 placeholder — keep the same interface).
- Produces: `export function renderDetail(el, cache, state, onState): void;` (Signatur wie Platzhalter).

- [ ] **Step 1: Write the failing test**

```ts
// tests/obsidian/detail.test.ts
import { renderDetail } from "../../src/obsidian/tabs/detail";
import type { HealthCache } from "../../src/core/types";
import type { RangeKey } from "../../src/core/rollup";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "", _click: null as any,
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(_t: string, o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSvg(tag: string) { const c = fakeEl(); c.tag = tag; el.children.push(c); return c; },
    addEventListener(_ev: string, cb: any) { el._click = cb; }, setAttribute() {}, toggleClass() {}, addClass() {},
  };
  return el;
}
function findText(el: any, needle: string): boolean {
  if (typeof el.text === "string" && el.text.includes(needle)) return true;
  return el.children.some((c: any) => findText(c, needle));
}
function findByText(el: any, needle: string): any {
  if (el.text === needle) return el;
  for (const c of el.children) { const hit = findByText(c, needle); if (hit) return hit; }
  return null;
}
const cache: HealthCache = {
  version: 1, sourceFile: "", importedAt: "", recordCount: 1, skippedCount: 0,
  dateRange: { from: "2026-01-01", to: "2026-01-31" },
  metrics: { HKQuantityTypeIdentifierStepCount: { unit: "count", policy: "sum", daily: { "2026-01-10": { sum: 500, count: 1 } } } },
  workouts: [],
};

describe("renderDetail", () => {
  it("ohne gewählte Metrik → Hinweis, kein Absturz", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: null, range: "3M" }, () => {});
    expect(findText(el, "Metrik")).toBe(true);
  });

  it("mit Metrik → Titel + Range-Buttons + Summe-Stat", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {});
    expect(findText(el, "Schritte")).toBe(true);
    expect(findText(el, "Summe")).toBe(true);
    expect(findText(el, "1M")).toBe(true);
  });

  it("Klick auf 1M-Button meldet range=1M an onState", () => {
    const el = fakeEl();
    let got: RangeKey | null = null;
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, (s) => { got = s.range; });
    const btn = findByText(el, "1M");
    expect(btn).not.toBeNull();
    btn._click();
    expect(got).toBe("1M");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/detail.test.ts`
Expected: FAIL — placeholder rendert keinen Text.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/obsidian/tabs/detail.ts
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
    el.createDiv({ cls: "ah-detail-hint", text: "Wähle in der Übersicht eine Metrik aus." });
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
    el.createDiv({ cls: "ah-detail-hint", text: "Keine Daten in diesem Zeitraum." });
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/detail.test.ts && npm test`
Expected: PASS (3 Tests + alle bestehenden grün).

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/tabs/detail.ts tests/obsidian/detail.test.ts
git commit -m "feat(obsidian): detail tab — range presets, big chart, per-policy stat row"
```

---

## Task 10: `tabs/workouts.ts` (Monats-Balken + Liste)

**Files:**
- Modify: `src/obsidian/tabs/workouts.ts` (replace placeholder)
- Create: `src/core/workout-summary.ts` (pure) + Test
- Test: `tests/core/workout-summary.test.ts`, `tests/obsidian/workouts.test.ts`

**Interfaces:**
- Consumes: `WorkoutEntry`/`HealthCache` (`src/core/types.ts`), `buildChartGeometry` (Task 3), `renderChart` (Task 6).
- Produces:
  ```ts
  // workout-summary.ts
  export interface WorkoutRow { type: string; date: string; durationMin: number; }
  export interface WorkoutSummary { monthly: Array<{ key: string; value: number }>; recent: WorkoutRow[]; }
  export function summarizeWorkouts(workouts: WorkoutEntry[], recentLimit: number): WorkoutSummary;
  // workouts.ts
  export function renderWorkouts(el: HTMLElement, cache: HealthCache): void;
  ```

- [ ] **Step 1: Write the failing pure test**

```ts
// tests/core/workout-summary.test.ts
import { summarizeWorkouts } from "../../src/core/workout-summary";
import type { WorkoutEntry } from "../../src/core/types";

describe("summarizeWorkouts", () => {
  const ws: WorkoutEntry[] = [
    { type: "Running", start: "2026-01-05T08:00", durationMin: 30 },
    { type: "Running", start: "2026-01-20T08:00", durationMin: 40 },
    { type: "Cycling", start: "2026-02-02T18:00", durationMin: 60 },
  ];
  it("monatliche Anzahl je Monat, aufsteigend sortiert", () => {
    const s = summarizeWorkouts(ws, 10);
    expect(s.monthly).toEqual([{ key: "2026-01", value: 2 }, { key: "2026-02", value: 1 }]);
  });
  it("recent: neueste zuerst, limitiert", () => {
    const s = summarizeWorkouts(ws, 2);
    expect(s.recent.map((r) => r.date)).toEqual(["2026-02-02", "2026-01-20"]);
    expect(s.recent[0].type).toBe("Cycling");
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npx vitest run tests/core/workout-summary.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement pure summary**

```ts
// src/core/workout-summary.ts
import type { WorkoutEntry } from "./types";

export interface WorkoutRow { type: string; date: string; durationMin: number; }
export interface WorkoutSummary { monthly: Array<{ key: string; value: number }>; recent: WorkoutRow[]; }

export function summarizeWorkouts(workouts: WorkoutEntry[], recentLimit: number): WorkoutSummary {
  const counts = new Map<string, number>();
  for (const w of workouts) {
    const month = w.start.slice(0, 7);
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  const monthly = [...counts.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const recent = [...workouts]
    .sort((a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0))
    .slice(0, recentLimit)
    .map((w) => ({ type: w.type, date: w.start.slice(0, 10), durationMin: w.durationMin }));

  return { monthly, recent };
}
```

- [ ] **Step 4: Run + pass**

Run: `npx vitest run tests/core/workout-summary.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Write the failing obsidian test**

```ts
// tests/obsidian/workouts.test.ts
import { renderWorkouts } from "../../src/obsidian/tabs/workouts";
import type { HealthCache } from "../../src/core/types";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "",
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(_t: string, o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSvg(tag: string) { const c = fakeEl(); c.tag = tag; el.children.push(c); return c; },
    addEventListener() {}, setAttribute() {}, addClass() {},
  };
  return el;
}
function countClass(el: any, cls: string): number {
  let n = el.cls === cls ? 1 : 0;
  for (const c of el.children) n += countClass(c, cls);
  return n;
}
const cache: HealthCache = {
  version: 1, sourceFile: "", importedAt: "", recordCount: 0, skippedCount: 0, dateRange: null,
  metrics: {},
  workouts: [
    { type: "Running", start: "2026-01-05T08:00", durationMin: 30 },
    { type: "Cycling", start: "2026-02-02T18:00", durationMin: 60 },
  ],
};

describe("renderWorkouts", () => {
  it("rendert eine Zeile pro Workout", () => {
    const el = fakeEl();
    renderWorkouts(el, cache);
    expect(countClass(el, "ah-workout-row")).toBe(2);
  });
  it("leere Workouts → Hinweis statt Absturz", () => {
    const el = fakeEl();
    expect(() => renderWorkouts(el, { ...cache, workouts: [] })).not.toThrow();
  });
});
```

- [ ] **Step 6: Run + fail**

Run: `npx vitest run tests/obsidian/workouts.test.ts`
Expected: FAIL — placeholder rendert keine Zeilen.

- [ ] **Step 7: Implement the workouts tab**

```ts
// src/obsidian/tabs/workouts.ts
import type { HealthCache } from "../../core/types";
import { summarizeWorkouts } from "../../core/workout-summary";
import { buildChartGeometry } from "../../core/chart-geometry";
import type { RollupPoint } from "../../core/rollup";
import { renderChart } from "../chart-render";

const CHART_DIMS = { width: 640, height: 160, padding: 20 };
const RECENT_LIMIT = 50;

export function renderWorkouts(el: HTMLElement, cache: HealthCache): void {
  const summary = summarizeWorkouts(cache.workouts, RECENT_LIMIT);

  if (cache.workouts.length === 0) {
    el.createDiv({ cls: "ah-detail-hint", text: "Keine Workouts im Export." });
    return;
  }

  el.createEl("h3", { text: "Workouts pro Monat" });
  const points: RollupPoint[] = summary.monthly.map((m) => ({ key: m.key, value: m.value }));
  const chartBox = el.createDiv({ cls: "ah-detail-chart" });
  renderChart(chartBox, buildChartGeometry(points, "bar", CHART_DIMS), { axis: true });

  el.createEl("h3", { text: "Letzte Workouts" });
  const list = el.createDiv({ cls: "ah-workout-list" });
  for (const w of summary.recent) {
    const row = list.createDiv({ cls: "ah-workout-row" });
    row.createSpan({ cls: "ah-workout-type", text: w.type });
    row.createSpan({ cls: "ah-workout-date", text: w.date });
    row.createSpan({ cls: "ah-workout-dur", text: `${w.durationMin} min` });
  }
}
```

- [ ] **Step 8: Run + pass**

Run: `npx vitest run tests/obsidian/workouts.test.ts && npm test`
Expected: PASS (alle grün).

- [ ] **Step 9: Commit**

```bash
git add src/core/workout-summary.ts src/obsidian/tabs/workouts.ts tests/core/workout-summary.test.ts tests/obsidian/workouts.test.ts
git commit -m "feat: workouts tab — monthly bar chart + recent list (pure summary + render)"
```

---

## Task 11: `main.ts` wiring + favorites persistence + `styles.css`

**Files:**
- Modify: `src/main.ts`
- Modify: `styles.css`
- Test: `tests/obsidian/main-host.test.ts`

**Interfaces:**
- Consumes: `DashboardView`/`VIEW_TYPE_DASHBOARD`/`DashboardHost` (Task 7), `aggregateStream`/`openImportSource`/`pickImportFile` (bestehend).
- Produces: Plugin registriert View + Command/Ribbon; implementiert `DashboardHost`; persistiert Favoriten via `loadData`/`saveData`.

- [ ] **Step 1: Write the failing test (favorites toggle persists)**

```ts
// tests/obsidian/main-host.test.ts
import AppleHealthPlugin from "../../src/main";

describe("AppleHealthPlugin favorites host", () => {
  it("toggleFavorite fügt hinzu und entfernt, persistiert über saveData", async () => {
    const p = new AppleHealthPlugin({} as any, {} as any) as any;
    const saved: any[] = [];
    p.loadData = async () => ({ favorites: [] });
    p.saveData = async (d: any) => { saved.push(d); };
    await p.loadPluginData();
    expect(p.getFavorites()).toEqual([]);
    await p.toggleFavorite("HKQuantityTypeIdentifierStepCount");
    expect(p.getFavorites()).toEqual(["HKQuantityTypeIdentifierStepCount"]);
    await p.toggleFavorite("HKQuantityTypeIdentifierStepCount");
    expect(p.getFavorites()).toEqual([]);
    expect(saved.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run + fail**

Run: `npx vitest run tests/obsidian/main-host.test.ts`
Expected: FAIL — `loadPluginData`/`getFavorites`/`toggleFavorite` existieren nicht.

- [ ] **Step 3: Rewrite `src/main.ts`**

```ts
// src/main.ts
import { FileSystemAdapter, Notice, Plugin, WorkspaceLeaf } from "obsidian";
import { join } from "node:path";
import { readdir, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { aggregateStream } from "./core/pipeline";
import type { HealthCache } from "./core/types";
import { openImportSource, pickImportFile } from "./obsidian/health-source";
import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "./obsidian/dashboard-view";

const CACHE_FILE = "health-cache.json";

interface PluginData { favorites: string[]; }
const DEFAULT_DATA: PluginData = { favorites: [] };

export default class AppleHealthPlugin extends Plugin implements DashboardHost {
  private data: PluginData = { ...DEFAULT_DATA };

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

    this.addCommand({ id: "import", name: "Import ausführen", callback: () => { void this.runImport(); } });
    this.addCommand({ id: "open-dashboard", name: "Dashboard öffnen", callback: () => { void this.activateView(); } });
    this.addRibbonIcon("heart-pulse", "Apple Health Dashboard", () => { void this.activateView(); });
  }

  onunload(): void {}

  // --- Persistence ---
  async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    this.data = { ...DEFAULT_DATA, ...(loaded ?? {}) };
  }

  // --- DashboardHost ---
  getFavorites(): string[] { return this.data.favorites; }

  async toggleFavorite(id: string): Promise<void> {
    const i = this.data.favorites.indexOf(id);
    if (i >= 0) this.data.favorites.splice(i, 1);
    else this.data.favorites.push(id);
    await this.saveData(this.data);
  }

  async loadCache(): Promise<HealthCache | null> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return null;
    const path = join(adapter.getBasePath(), this.manifest.dir ?? "", CACHE_FILE);
    try {
      const raw = await readFile(path, "utf8");
      return JSON.parse(raw) as HealthCache;
    } catch {
      return null;
    }
  }

  runImport(): void { void this.runImportInternal(); }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    }
    await workspace.revealLeaf(leaf);
  }

  private async runImportInternal(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice("Apple Health: nur auf dem Desktop verfügbar.");
      return;
    }
    const pluginDir = join(adapter.getBasePath(), this.manifest.dir ?? "");
    const importDir = join(pluginDir, "import");

    let names: string[];
    try { names = await readdir(importDir); }
    catch { new Notice("Apple Health: Ordner 'import/' nicht gefunden."); return; }

    const file = pickImportFile(names);
    if (!file) { new Notice("Apple Health: keine .zip/.xml in 'import/' gefunden."); return; }

    new Notice(`Apple Health: Import von ${file} gestartet …`);
    try {
      const cache = await aggregateStream(
        openImportSource(join(importDir, file)),
        { sourceFile: file, importedAt: new Date().toISOString() },
        (records) => new Notice(`Apple Health: ${records.toLocaleString()} Records …`),
      );
      await writeFile(join(pluginDir, CACHE_FILE), JSON.stringify(cache), "utf8");
      const types = Object.keys(cache.metrics).length;
      const range = cache.dateRange ? `${cache.dateRange.from}–${cache.dateRange.to}` : "—";
      new Notice(
        `Apple Health: fertig ✓ — ${cache.recordCount.toLocaleString()} Records · ${types} Metriken · ${cache.workouts.length} Workouts · Zeitraum ${range} (Klick schließt)`,
        0,
      );
    } catch (e) {
      new Notice(`Apple Health: Import fehlgeschlagen — ${e instanceof Error ? e.message : String(e)}`, 0);
    }
  }
}
```

- [ ] **Step 4: Extend the obsidian mock for new Plugin methods**

Add to `Plugin` in `tests/__mocks__/obsidian.ts`: `addRibbonIcon() {}`, `async loadData(){return null;}`, `async saveData(){}`, and add `FileSystemAdapter` + `Platform` if missing:

```ts
// ensure these exist in tests/__mocks__/obsidian.ts:
export class FileSystemAdapter { getBasePath() { return "/fake"; } }
// in class Plugin { ... } add:
  addRibbonIcon(_i: string, _t: string, _cb: any) { return makeEl(); }
  async loadData(): Promise<any> { return null; }
  async saveData(_d: any): Promise<void> {}
```

- [ ] **Step 5: Run + pass**

Run: `npx vitest run tests/obsidian/main-host.test.ts && npm test`
Expected: PASS (favorites toggle + alle bestehenden Tests grün).

- [ ] **Step 6: Write `styles.css`**

```css
/* Apple Health — Dashboard. Nur Theme-Variablen, Präfix ah-. */
.ah-dashboard { padding: var(--size-4-2); }

.ah-tabbar { display: flex; gap: var(--size-4-2); border-bottom: 1px solid var(--background-modifier-border); margin-bottom: var(--size-4-3); }
.ah-tab { display: flex; align-items: center; gap: var(--size-4-1); padding: var(--size-4-2) var(--size-4-3); cursor: pointer; color: var(--text-muted); border-bottom: 2px solid transparent; }
.ah-tab.is-active { color: var(--text-normal); border-bottom-color: var(--interactive-accent); }
.ah-tab:hover { background: var(--background-modifier-hover); }

.is-hidden { display: none; }

.ah-tile-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: var(--size-4-2); }
.ah-tile { background: var(--background-secondary); border: 1px solid var(--background-modifier-border); border-radius: var(--radius-m); padding: var(--size-4-2); cursor: pointer; }
.ah-tile:hover { background: var(--background-modifier-hover); }
.ah-tile-head { display: flex; justify-content: space-between; align-items: center; }
.ah-tile-name { font-size: var(--font-ui-small); color: var(--text-muted); }
.ah-tile-star { cursor: pointer; color: var(--text-faint); }
.ah-tile-value { font-size: var(--font-ui-large); font-weight: var(--font-bold); color: var(--text-normal); margin: var(--size-4-1) 0; }
.ah-tile-spark svg { width: 100%; height: 36px; display: block; }

.ah-cat { margin-top: var(--size-4-3); }
.ah-cat-summary { cursor: pointer; color: var(--text-normal); font-weight: var(--font-semibold); padding: var(--size-4-1) 0; }
.ah-fav-section h3, .ah-cat + h3 { color: var(--text-normal); }

.ah-range-bar { display: flex; gap: var(--size-4-1); margin: var(--size-4-2) 0; }
.ah-range-btn { color: var(--text-muted); }
.ah-range-btn.is-active { color: var(--text-on-accent); background: var(--interactive-accent); }

.ah-detail-head { display: flex; align-items: baseline; gap: var(--size-4-2); }
.ah-detail-range { color: var(--text-faint); font-size: var(--font-ui-small); }
.ah-detail-chart svg { width: 100%; height: auto; display: block; }
.ah-detail-hint { color: var(--text-muted); padding: var(--size-4-4); text-align: center; }

.ah-chart-line { stroke: var(--interactive-accent); stroke-width: 2; fill: none; }
.ah-chart-band { fill: var(--interactive-accent); opacity: 0.15; }
.ah-chart-bar { fill: var(--interactive-accent); }
.ah-chart-grid { stroke: var(--background-modifier-border); stroke-width: 1; }

.ah-stat-row { display: flex; gap: var(--size-4-4); margin-top: var(--size-4-3); flex-wrap: wrap; }
.ah-stat-cell { display: flex; flex-direction: column; }
.ah-stat-label { font-size: var(--font-ui-smaller); color: var(--text-muted); }
.ah-stat-value { font-size: var(--font-ui-medium); color: var(--text-normal); }

.ah-workout-list { display: flex; flex-direction: column; }
.ah-workout-row { display: flex; justify-content: space-between; gap: var(--size-4-2); padding: var(--size-4-1) 0; border-bottom: 1px solid var(--background-modifier-border); }
.ah-workout-type { color: var(--text-normal); }
.ah-workout-date, .ah-workout-dur { color: var(--text-muted); }

.ah-empty { text-align: center; padding: var(--size-4-6); color: var(--text-muted); }
```

- [ ] **Step 7: Typecheck + lint + full test**

Run: `npm run typecheck && npm run lint && npm test`
Expected: alle grün, keine Type-/Lint-Fehler. (Falls Lint `no-innerHTML` o.ä. meldet → beheben; wir nutzen ausschließlich `createEl`/`createSvg`.)

- [ ] **Step 8: Commit**

```bash
git add src/main.ts styles.css tests/__mocks__/obsidian.ts tests/obsidian/main-host.test.ts
git commit -m "feat(obsidian): wire dashboard view, ribbon/command, favorites persistence + styles"
```

---

## Task 12: Manueller Smoke-Test (renderer-only Gate)

**Files:** keine Code-Änderung (außer evtl. Fixes, die der Smoke-Test aufdeckt).

Dies ist das **verbindliche Integrations-Gate** (LESSONS.md 2026-07-19): SVG-DOM via `createSvg` und der `ItemView`-Lebenszyklus laufen nur im Electron-Renderer — Node-Tests sehen sie nicht.

- [ ] **Step 1: Build + Deploy nach ProtoVault**

Run:
```bash
OBSIDIAN_PLUGIN_DIR="/Users/Shared/00_ProtoVault/.obsidian/plugins/apple-health" npm run deploy
```
Expected: `main.js`, `manifest.json`, `styles.css` kopiert, kein Build-Fehler.

- [ ] **Step 2: In Obsidian (ProtoVault) verifizieren**

Manuell prüfen (Plugin neu laden / Obsidian `Cmd+R`):
1. Ribbon-Icon „heart-pulse" bzw. Command „Dashboard öffnen" öffnet die View in der Hauptfläche.
2. **Übersicht:** Favoriten-Sektion (ggf. leer) + Kategorie-Sektionen klappen auf/zu; Kacheln zeigen Wert + Sparkline; Stern togglet Favorit und die Kachel wandert nach oben (Reload-fest → `data.json` enthält `favorites`).
3. **Detail:** Klick auf Kachel wechselt zu Detail mit großem Chart; Range-Buttons 1M/3M/1J/Alles ändern den Chart; `measure`-Metrik (Gewicht/Puls) zeigt Linie + Band, `sum` (Schritte) Balken; Stats stimmen plausibel.
4. **Workouts:** Monats-Balken + Liste der letzten Workouts.
5. **Kein Cache:** Cache-Datei kurz umbenennen → Empty-State mit „Import ausführen"-CTA; Klick startet Import.
6. **Konsole leeren, dann prüfen:** keine `Failed to construct 'Worker'`-, keine CSP-/`innerHTML`- und keine unerwarteten Fehler (DevTools-Issues vor dem Test leeren — Altlasten überleben `Cmd+R`).

- [ ] **Step 3: Falls Bugs → fixen (TDD wo möglich), sonst Handover aktualisieren**

Renderer-only-Bugs, die kein Node-Test fängt, hier beheben und committen. Danach:
- Cockpit `10_Pallas/25_Coding/apple-health/apple-health.md` §🧭 um „Slice 2 Dashboard-UI" ergänzen (Claude-Ergänzung, kein Auto-Block).
- Falls eine neue renderer-only-Falle auftauchte → `/Users/Shared/code/_docs/LESSONS.md` § 🟢 Aktiv ergänzen.

- [ ] **Step 4: Final commit (falls Fixes)**

```bash
git add -A
git commit -m "fix(obsidian): dashboard smoke-test findings from ProtoVault"
```

---

## Self-Review (vom Plan-Autor ausgefüllt)

**Spec-Coverage:**
- Übersicht→Drilldown 3 Tabs → Tasks 7–10 ✓
- Haupt-ItemView, volle Breite → Task 7 ✓
- Favoriten + Kategorie-Sektionen → Task 8 ✓ (Persistenz Task 11 ✓)
- Kuratierter DE-Katalog + Fallback → Task 1 ✓
- Range-Presets + Auto-Rollup (Tag/Woche/Monat) → Tasks 2, 9 ✓
- Chart-Mapping je Policy (sum/duration→Balken, measure→Linie+Band) → Tasks 1 (chartKind), 3, 5 ✓
- Hand-SVG via createEl/createSvg, keine Lib → Task 6 ✓
- Empty/Fehler/keine-Daten/unbekannte-Metrik → Tasks 5, 7, 9 ✓
- Pure/Obsidian-Trennung, Node-Tests + manueller Smoke-Test → alle Tasks + Task 12 ✓
- chart-geometry als erstes Chart-Exemplar → Task 3 ✓ (Kit-Notiz in Spec)

**Placeholder-Scan:** keine TBD/TODO; jeder Code-Step zeigt vollständigen Code.

**Typ-Konsistenz:** `RollupPoint{key,value,min?,max?}`, `ResolvedRange{from,to,granularity}`, `RangeKey`, `ChartGeometry`, `ChartDims`, `TileVM`, `DetailVM`, `DetailState`, `DashboardHost` konsistent über Consumer/Producer. `DetailState` in Task 7 (Platzhalter) definiert, Task 9 nutzt dieselbe Signatur. `view.host`/`view.refreshOverview`/`view.openDetail` in Task 7/8 konsistent bereitgestellt.
