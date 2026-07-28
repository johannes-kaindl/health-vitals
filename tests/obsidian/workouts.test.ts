import { renderWorkouts } from "../../src/obsidian/tabs/workouts";
import type { HealthCache } from "../../src/core/types";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "",
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(_t: string, o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
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
  it("Monatschart hat Gitterlinien", () => {
    const el = fakeEl();
    renderWorkouts(el, cache);
    expect(countClass(el, "ah-chart-grid")).toBeGreaterThan(0);
  });
});
