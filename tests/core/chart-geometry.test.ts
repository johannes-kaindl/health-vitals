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

  it("ohne opts (Sparkline-Aufruf) bleiben xTicks und weekMarks leer", () => {
    const pts: RollupPoint[] = Array.from({ length: 30 }, (_, i) => ({
      key: `2026-07-${String(i + 1).padStart(2, "0")}`, value: i,
    }));
    const g = buildChartGeometry(pts, "line", dims);
    expect(g.xTicks).toEqual([]);
    expect(g.weekMarks).toEqual([]);
  });

  it("leere Serie → xTicks und weekMarks leer, kein Absturz", () => {
    const g = buildChartGeometry([], "bar", dims, { granularity: "day" });
    expect(g.xTicks).toEqual([]);
    expect(g.weekMarks).toEqual([]);
  });

  it("91 Punkte → 5 Ticks, gleichmäßiger Abstand, erster bei Index 0", () => {
    const pts: RollupPoint[] = Array.from({ length: 91 }, (_, i) => ({ key: `k${i}`, value: i }));
    const g = buildChartGeometry(pts, "line", dims, { granularity: "day" });
    expect(g.xTicks).toHaveLength(5);
    expect(g.xTicks[0].i).toBe(0);
    // step = ceil(91 / 5) = 19
    expect(g.xTicks.map((t) => t.i)).toEqual([0, 19, 38, 57, 76]);
  });

  it("weniger Punkte als Zielzahl → jeder Punkt bekommt einen Tick", () => {
    const pts: RollupPoint[] = [{ key: "a", value: 1 }, { key: "b", value: 2 }, { key: "c", value: 3 }];
    const g = buildChartGeometry(pts, "line", dims, { granularity: "day" });
    expect(g.xTicks.map((t) => t.i)).toEqual([0, 1, 2]);
  });

  it("ein Punkt → ein Tick, x mittig wie die Linie selbst", () => {
    const g = buildChartGeometry([{ key: "a", value: 1 }], "line", dims, { granularity: "day" });
    expect(g.xTicks).toHaveLength(1);
    // n <= 1: scaleX liefert padding + innerW / 2 = 5 + 45 = 50
    expect(g.xTicks[0].x).toBeCloseTo(50);
  });

  it("weekMarks: nur Montage, und nur bei Tagesgranularität", () => {
    // 2026-07-27 ist ein Montag, 2026-08-03 der nächste.
    const pts: RollupPoint[] = [
      { key: "2026-07-26", value: 1 }, // So
      { key: "2026-07-27", value: 2 }, // Mo
      { key: "2026-07-28", value: 3 }, // Di
      { key: "2026-08-03", value: 4 }, // Mo
    ];
    const day = buildChartGeometry(pts, "bar", dims, { granularity: "day" });
    expect(day.weekMarks).toHaveLength(2);

    const week = buildChartGeometry(pts, "bar", dims, { granularity: "week" });
    expect(week.weekMarks).toEqual([]);
    const month = buildChartGeometry(pts, "bar", dims, { granularity: "month" });
    expect(month.weekMarks).toEqual([]);
  });

  it("bar: Wochenlinie am Slot-Anfang, Tick in der Slot-Mitte", () => {
    const pts: RollupPoint[] = [
      { key: "2026-07-27", value: 1 }, // Mo, Index 0
      { key: "2026-07-28", value: 2 },
    ];
    const g = buildChartGeometry(pts, "bar", dims, { granularity: "day" });
    // innerW = 90, n = 2 → slotW = 45; Slot 0 beginnt bei padding = 5, Mitte bei 27.5
    expect(g.weekMarks[0]).toBeCloseTo(5);
    expect(g.xTicks[0].x).toBeCloseTo(27.5);
  });

  // Der Linien-Pfad (scaleX) ist der Live-Pfad jeder `measure`-Metrik (Puls,
  // Gewicht, Sauerstoffsättigung) — der bar-Pfad hatte oben zwei eigene Tests,
  // dieser hatte keinen.
  it("line: Wochenlinien folgen auch bei Tagesgranularität nur den Montagen", () => {
    // 2026-07-27 ist ein Montag, 2026-08-03 der nächste (wie im bar-Pendant oben).
    const pts: RollupPoint[] = [
      { key: "2026-07-26", value: 1 }, // So
      { key: "2026-07-27", value: 2 }, // Mo
      { key: "2026-07-28", value: 3 }, // Di
      { key: "2026-08-03", value: 4 }, // Mo
    ];
    const g = buildChartGeometry(pts, "line", dims, { granularity: "day" });
    expect(g.weekMarks).toHaveLength(2);
  });

  it("line: Wochenlinie sitzt auf scaleX(i) (Punkt-Position), nicht auf dem Slot-Anfang wie beim Balken", () => {
    const pts: RollupPoint[] = [
      { key: "2026-07-26", value: 1 }, // So, Index 0
      { key: "2026-07-27", value: 2 }, // Mo, Index 1
      { key: "2026-07-28", value: 3 }, // Di, Index 2
    ];
    const g = buildChartGeometry(pts, "line", dims, { granularity: "day" });
    // innerW = 90, n = 3 → scaleX(1) = padding + innerW * 1/(n-1) = 5 + 45 = 50.
    // Beim bar-Pfad läge der gleichzeitige Slot-Anfang bei padding + i*slotW = 35 —
    // andere Formel, anderer Wert; dieser Test würde also auch eine versehentliche
    // Wiederverwendung der Slot-Formel im Linien-Pfad auffangen.
    expect(g.weekMarks).toHaveLength(1);
    expect(g.weekMarks[0]).toBeCloseTo(50);
  });
});
