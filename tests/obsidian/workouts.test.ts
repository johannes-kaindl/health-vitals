import { renderWorkouts } from "../../src/obsidian/tabs/workouts";
import type { HealthCache } from "../../src/core/types";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "",
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createEl(_t: string, o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSvg(tag: string, o?: any) { const c = fakeEl(); c.tag = tag; c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    addEventListener() {}, setAttribute() {}, addClass() {},
  };
  return el;
}
function countClass(el: any, cls: string): number {
  let n = el.cls === cls ? 1 : 0;
  for (const c of el.children) n += countClass(c, cls);
  return n;
}
function allText(el: any): string {
  return [el.text ?? "", ...el.children.map(allText)].join(" ");
}
const cache: HealthCache = {
  version: 3, sourceFile: "", importedAt: "", recordCount: 0, skippedCount: 0, dateRange: null,
  metrics: {},
  workouts: [
    { type: "Running", start: "2026-01-05T08:00", durationMin: 30, distanceKm: 5.5, energyKcal: 320 },
    { type: "Cycling", start: "2026-02-02T18:00", durationMin: 60, distanceKm: 24, energyKcal: 700 },
    { type: "Yoga",    start: "2026-02-10T19:00", durationMin: 35, energyKcal: 142 },
  ],
};

describe("renderWorkouts", () => {
  it("rendert eine Zeile pro Workout", () => {
    const el = fakeEl();
    renderWorkouts(el, cache);
    expect(countClass(el, "ah-workout-row")).toBe(3);
  });
  it("leere Workouts → Hinweis statt Absturz", () => {
    const el = fakeEl();
    expect(() => renderWorkouts(el, { ...cache, workouts: [] })).not.toThrow();
  });
  it("Monatschart hat Gitterlinien", () => {
    const el = fakeEl();
    renderWorkouts(el, cache);
    expect(countClass(el, "ah-chart-grid")).toBeGreaterThan(0);
  });

  it("zeigt eine Summenzeile fuer den juengsten Monat", () => {
    const el = fakeEl();
    renderWorkouts(el, cache);
    expect(countClass(el, "ah-workout-total")).toBe(1);
    const text = allText(el);
    expect(text).toContain("24");     // km-Summe Februar
    expect(text).toContain("842");    // kcal-Summe Februar
  });

  it("zeigt Distanz und Energie je Zeile", () => {
    const el = fakeEl();
    renderWorkouts(el, cache);
    expect(countClass(el, "ah-workout-dist")).toBe(3);
    expect(countClass(el, "ah-workout-kcal")).toBe(3);
  });

  // Ein Yoga hat keine Distanz — es ist nicht null Kilometer gelaufen.
  it("fehlende Distanz erscheint als Gedankenstrich, nicht als 0", () => {
    const el = fakeEl();
    renderWorkouts(el, cache);
    const text = allText(el);
    expect(text).toContain("—");
    expect(text).not.toMatch(/(^|\s)0 km/);
  });

  // Trägt keines der Workouts eines Monats eine Energie, ist die Monatssumme 0 —
  // das ist derselbe Fall wie fehlende Distanz und darf nicht als "0 kcal" erscheinen.
  it("fehlende Energie in der Summenzeile erscheint als Gedankenstrich, nicht als 0", () => {
    const noEnergyCache: HealthCache = {
      ...cache,
      workouts: [{ type: "Yoga", start: "2026-03-10T19:00", durationMin: 40 }],
    };
    const el = fakeEl();
    renderWorkouts(el, noEnergyCache);
    const text = allText(el);
    expect(text).not.toMatch(/(^|\s)0 kcal/);
  });
});
