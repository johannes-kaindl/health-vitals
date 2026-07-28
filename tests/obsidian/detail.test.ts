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
    setCssStyles(_styles: Record<string, string>) {},
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
function fakeView(): any {
  const store: Record<string, boolean> = {};
  return {
    app: {},
    host: {
      getExportFolder: () => "",
      setExportFolder: () => {},
      getExportFormat: () => "md",
      setExportFormat: () => {},
      getCollapsed: (k: string) => store[k],
      setCollapsed: (k: string, c: boolean) => { store[k] = c; },
    },
  };
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
    renderDetail(el, cache, { metricId: null, range: "3M" }, () => {}, fakeView());
    expect(findText(el, "Metrik")).toBe(true);
  });

  it("mit Metrik → Titel + Range-Buttons + Summe-Stat", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    expect(findText(el, "Schritte")).toBe(true);
    expect(findText(el, "Summe")).toBe(true);
    expect(findText(el, "1M")).toBe(true);
  });

  it("Klick auf 1M-Button meldet range=1M an onState", () => {
    const el = fakeEl();
    let got: RangeKey | null = null;
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, (s) => { got = s.range; }, fakeView());
    const btn = findByText(el, "1M");
    expect(btn).not.toBeNull();
    btn._click();
    expect(got).toBe("1M");
  });
});

describe("renderDetail — Werte-Tabelle", () => {
  it("mit Daten: Sektion mit Titel und Zeilenzahl", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    expect(findText(el, "Werte")).toBe(true);
  });

  it("Tabelle trägt Kopfzeile und eine Zeile je Punkt", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    // range "all" rollt auf Monatsgranularität hoch (resolveRange), daher "Monat" statt "Datum" im Kopf.
    expect(findText(el, "Monat")).toBe(true);
    expect(findText(el, "2026-01")).toBe(true); // Monatsschlüssel bei range "all"
  });

  it("ohne Daten im Zeitraum: keine Sektion", () => {
    const leer: HealthCache = { ...cache, dateRange: { from: "2020-01-01", to: "2020-01-02" } };
    const el = fakeEl();
    renderDetail(el, leer, { metricId: "HKQuantityTypeIdentifierStepCount", range: "1M" }, () => {}, fakeView());
    expect(findText(el, "Werte")).toBe(false);
  });
});
