import { renderChart } from "../../src/obsidian/chart-render";
import { buildChartGeometry } from "../../src/core/chart-geometry";
import type { RollupPoint } from "../../src/core/rollup";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "", style: {},
    createSvg(tag: string, o?: any) {
      const c = fakeEl(); c.tag = tag; c.attrs = (o && o.attr) || {}; c.cls = (o && o.cls) || "";
      el.children.push(c); return c;
    },
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createSpan(o?: any) {
      const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || "";
      el.children.push(c); return c;
    },
    setCssStyles(styles: Record<string, string>) { Object.assign(el.style, styles); },
  };
  return el;
}
function findText(el: any, needle: string): boolean {
  if (typeof el.text === "string" && el.text.includes(needle)) return true;
  return (el.children ?? []).some((c: any) => findText(c, needle));
}
function findByCls(el: any, cls: string): any {
  if (typeof el.cls === "string" && el.cls.split(/\s+/).includes(cls)) return el;
  for (const c of el.children ?? []) { const hit = findByCls(c, cls); if (hit) return hit; }
  return null;
}
function collectByCls(el: any, cls: string): any[] {
  const out: any[] = [];
  const walk = (n: any): void => {
    if (typeof n.cls === "string" && n.cls.split(/\s+/).includes(cls)) out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(el);
  return out;
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

describe("renderChart mit Achsen", () => {
  const geom = {
    kind: "bar" as const, width: 100, height: 50,
    polyline: "", band: "",
    bars: [{ x: 5, y: 10, w: 8, h: 30 }],
    yTicks: [{ y: 45, value: 0 }, { y: 25, value: 50 }, { y: 5, value: 100 }],
    xTicks: [{ i: 0, x: 10 }],
    weekMarks: [5, 55],
  };
  const axis = {
    x: [{ leftPct: 10, label: "28.07." }],
    y: [{ topPct: 90, label: "0" }, { topPct: 50, label: "50" }, { topPct: 10, label: "100" }],
  };

  it("ohne axis-Option: kein Label-DOM, Sparkline-Verhalten unverändert", () => {
    const el = fakeEl();
    renderChart(el, geom);
    expect(findByCls(el, "ah-axis-x")).toBeNull();
    expect(findByCls(el, "ah-axis-y")).toBeNull();
  });

  it("mit axis: y-Labels und x-Labels werden gerendert", () => {
    const el = fakeEl();
    renderChart(el, geom, { axis });
    const xRow = findByCls(el, "ah-axis-x");
    const yCol = findByCls(el, "ah-axis-y");
    expect(xRow).not.toBeNull();
    expect(yCol).not.toBeNull();
    expect(findText(el, "28.07.")).toBe(true);
    expect(findText(el, "100")).toBe(true);
  });

  it("mit axis: Wochenlinien werden als eigene SVG-Linien gezeichnet", () => {
    const el = fakeEl();
    renderChart(el, geom, { axis });
    const weekLines = collectByCls(el, "ah-chart-week");
    expect(weekLines).toHaveLength(2);
  });

  it("ohne axis: keine Wochenlinien, auch wenn die Geometrie welche trägt", () => {
    const el = fakeEl();
    renderChart(el, geom);
    expect(collectByCls(el, "ah-chart-week")).toHaveLength(0);
  });
});
