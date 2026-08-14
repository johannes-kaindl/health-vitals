import { renderChart, renderStackChart } from "../../src/obsidian/chart-render";
import { buildChartGeometry, buildStackGeometry } from "../../src/core/chart-geometry";
import type { StagePoint } from "../../src/core/sleep-stages";
import type { RollupPoint } from "../../src/core/rollup";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "", style: {},
    createSvg(tag: string, o?: any) {
      const c = fakeEl(); c.tag = tag; c.attrs = (o && o.attr) || {}; c.cls = (o && o.cls) || "";
      c.text = (o && o.text) || "";
      el.children.push(c); return c;
    },
    createDiv(o?: any) {
      const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || "";
      el.children.push(c); return c;
    },
    createSpan(o?: any) {
      const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || "";
      el.children.push(c); return c;
    },
    setCssStyles(styles: Record<string, string>) { Object.assign(el.style, styles); },
    setText(v: string) { el.text = v; },
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

  it("mit axis: y-Spaltenbreite folgt der längsten Beschriftung (I-2, kein fixes ch)", () => {
    const wideAxis = {
      x: [{ leftPct: 10, label: "28.07." }],
      // "374.512" (7 Zeichen) — der konkrete Fehlszenario-Wert aus dem Review:
      // eine feste 4ch-Box hätte das auf "4.512" zurechtgeschnitten.
      y: [{ topPct: 90, label: "0" }, { topPct: 10, label: "374.512" }],
    };
    const el = fakeEl();
    renderChart(el, geom, { axis: wideAxis });
    const yCol = findByCls(el, "ah-axis-y");
    expect(yCol.style.width).toBe("7ch");
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

  it("ohne Optionen: keine Gitterlinien", () => {
    const el = fakeEl();
    renderChart(el, geom);
    expect(collectByCls(el, "ah-chart-grid")).toHaveLength(0);
  });

  it("mit grid: Gitterlinien werden gezeichnet, aber kein Label-DOM und kein Wrapper", () => {
    const el = fakeEl();
    renderChart(el, geom, { grid: true });
    expect(collectByCls(el, "ah-chart-grid")).toHaveLength(geom.yTicks.length);
    expect(findByCls(el, "ah-axis-x")).toBeNull();
    expect(findByCls(el, "ah-axis-y")).toBeNull();
    expect(findByCls(el, "ah-chart-frame")).toBeNull();
  });

  it("mit grid: keine Wochenlinien, auch wenn die Geometrie welche trägt", () => {
    const el = fakeEl();
    renderChart(el, geom, { grid: true });
    expect(collectByCls(el, "ah-chart-week")).toHaveLength(0);
  });
});

describe("renderStackChart", () => {
  const DIMS = { width: 100, height: 100, padding: 10 };
  function stagePoint(key: string, s: Partial<Record<"deep" | "core" | "rem" | "unspecified", number>>): StagePoint {
    return { key, stages: { deep: 0, core: 0, rem: 0, unspecified: 0, ...s }, nights: 1, awakeAvg: 0 };
  }
  const geom = buildStackGeometry(
    [stagePoint("2026-01-05", { deep: 60, core: 240 })], DIMS, { granularity: "day" },
  );
  const vm = {
    empty: false, chart: geom, axis: { x: [{ leftPct: 20, label: "5.1." }], y: [{ topPct: 0, label: "5h 0m" }] },
    legend: [{ stage: "deep" as const, label: "Tief" }, { stage: "core" as const, label: "Kern" }],
    note: null, stats: [],
  };

  it("zeichnet je Phase ein <rect> mit eigener Klasse", () => {
    const parent = fakeEl();
    renderStackChart(parent, vm);

    // Die Farbklasse tragen Segment UND Legenden-Swatch — sonst zeigte die Legende
    // eine andere Farbe als das Chart. Hier zaehlen nur die Segmente.
    const rects = collectByCls(parent, "ah-chart-stack");
    expect(rects.map((r: any) => r.tag)).toEqual(["rect", "rect"]);
    expect(collectByCls(parent, "ah-stage-deep").filter((n: any) => n.tag === "rect")).toHaveLength(1);
    expect(collectByCls(parent, "ah-stage-core").filter((n: any) => n.tag === "rect")).toHaveLength(1);
  });

  it("benennt jedes Segment im <title>, damit die Aussage nicht allein an der Farbe haengt", () => {
    const parent = fakeEl();
    renderStackChart(parent, vm);

    // WCAG 1.4.1: Farbe darf nicht der einzige Traeger der Information sein.
    expect(findText(parent, "Tief: 1h 0m")).toBe(true);
    expect(findText(parent, "Kern: 4h 0m")).toBe(true);
  });

  it("rendert die Legende mit genau den uebergebenen Phasen", () => {
    const parent = fakeEl();
    renderStackChart(parent, vm);

    const items = collectByCls(parent, "ah-legend-item");
    expect(items).toHaveLength(2);
    expect(findText(parent, "Kern")).toBe(true);
  });

  it("zeigt die Hinweiszeile nur, wenn das View-Model eine liefert", () => {
    const without = fakeEl();
    renderStackChart(without, vm);
    expect(findByCls(without, "ah-stage-note")).toBeNull();

    const with_ = fakeEl();
    renderStackChart(with_, { ...vm, note: "In 67 % der Nächte …" });
    expect(findText(with_, "In 67 % der Nächte …")).toBe(true);
  });

  it("uebernimmt Achsen-Labels und Wochenlinien wie das Detail-Chart", () => {
    const parent = fakeEl();
    renderStackChart(parent, vm);

    expect(findText(parent, "5h 0m")).toBe(true);
    expect(collectByCls(parent, "ah-chart-week")).toHaveLength(1);
  });
});
