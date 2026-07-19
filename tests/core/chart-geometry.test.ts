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
