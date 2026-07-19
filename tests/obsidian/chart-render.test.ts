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
