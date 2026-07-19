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

  it("zeigt Hinweis, wenn der Cache keine Metriken hat", () => {
    const el = fakeEl();
    const view: any = { openDetail() {}, refreshOverview() {}, host: { getFavorites: () => [], toggleFavorite: async () => {} } };
    const emptyCache = { ...cache, metrics: {} };
    renderOverview(el, emptyCache, view);
    expect(countClass(el, "ah-detail-hint")).toBe(1);
  });
});
