import { renderOverview } from "../../src/obsidian/tabs/overview";
import type { HealthCache } from "../../src/core/types";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "", tag: "", attrs: {} as any, _handlers: {} as any, open: false,
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(t: string, o?: any) { const c = fakeEl(); c.tag = t; c.cls = (o && o.cls) || ""; c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSvg(tag: string) { const c = fakeEl(); c.tag = tag; el.children.push(c); return c; },
    addEventListener(ev: string, cb: any) { (el._handlers[ev] ||= []).push(cb); },
    setAttribute(k: string, v: string) { el.attrs[k] = v; },
    toggleClass() {}, addClass() {},
    _fire(ev: string) { for (const cb of (el._handlers[ev] || [])) cb(); },
  };
  return el;
}
function countClass(el: any, cls: string): number {
  let n = el.cls === cls ? 1 : 0;
  for (const c of el.children) n += countClass(c, cls);
  return n;
}
function findByTag(el: any, tag: string): any[] {
  const out: any[] = el.tag === tag ? [el] : [];
  for (const c of el.children) out.push(...findByTag(c, tag));
  return out;
}
function summaryText(details: any): string {
  const s = findByTag(details, "summary")[0];
  return s ? s.text : "";
}
function makeView(expanded: Set<string>, seeded: boolean): any {
  return {
    openDetail() {}, refreshOverview() {},
    host: { getFavorites: () => [], toggleFavorite: async () => {} },
    expandedCategories: () => expanded,
    seedExpandedOnce: (fn: () => void) => { if (!seeded) { seeded = true; fn(); } },
  };
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
    const view = makeView(new Set(), true);
    renderOverview(el, cache, view);
    expect(countClass(el, "ah-tile")).toBe(2);
  });

  it("zeigt Hinweis, wenn der Cache keine Metriken hat", () => {
    const el = fakeEl();
    const view = makeView(new Set(), true);
    const emptyCache = { ...cache, metrics: {} };
    renderOverview(el, emptyCache, view);
    expect(countClass(el, "ah-detail-hint")).toBe(1);
  });

  it("öffnet genau die Kategorien aus dem gehaltenen Set (überlebt Re-Render)", () => {
    // Regression: früher klappten beim Favoriten-Toggle alle Sektionen zu.
    const expanded = new Set<string>(["body"]);
    const view = makeView(expanded, true); // schon geseedet → kein Default-Open
    const el = fakeEl();
    renderOverview(el, cache, view);
    const details = findByTag(el, "details");
    const koerper = details.find((d) => summaryText(d).startsWith("Körper"));
    const aktiv = details.find((d) => summaryText(d).startsWith("Aktivität"));
    expect(koerper.attrs.open).toBeDefined();   // im Set → offen
    expect(aktiv.attrs.open).toBeUndefined();   // nicht im Set → zu
  });

  it("seedet beim ersten Render die erste Kategorie offen, danach kein Re-Seed", () => {
    const expanded = new Set<string>();
    let seeded = false;
    const view: any = {
      openDetail() {}, refreshOverview() {},
      host: { getFavorites: () => [], toggleFavorite: async () => {} },
      expandedCategories: () => expanded,
      seedExpandedOnce: (fn: () => void) => { if (!seeded) { seeded = true; fn(); } },
    };
    renderOverview(fakeEl(), cache, view);
    expect(expanded.size).toBe(1); // erste Sektion geseedet
    expanded.clear();              // Nutzer klappt alles zu
    renderOverview(fakeEl(), cache, view);
    expect(expanded.size).toBe(0); // kein erneutes Seeden
  });

  it("toggle-Event pflegt das Set (auf/zu)", () => {
    const expanded = new Set<string>();
    const view = makeView(expanded, true);
    const el = fakeEl();
    renderOverview(el, cache, view);
    const koerper = findByTag(el, "details").find((d) => summaryText(d).startsWith("Körper"));
    koerper.open = true; koerper._fire("toggle");
    expect(expanded.has("body")).toBe(true);
    koerper.open = false; koerper._fire("toggle");
    expect(expanded.has("body")).toBe(false);
  });
});
