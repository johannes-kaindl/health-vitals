import { renderActivityRings } from "../../src/obsidian/tabs/activity";
import { buildActivityVM } from "../../src/core/view-model";
import type { HealthCache } from "../../src/core/types";
import { registerI18n } from "../../src/i18n/strings";
import { setLang } from "../../src/vendor/kit/i18n";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "", attr: {} as Record<string, unknown> };
  const make = (tag: string, o?: any): any => { const c = fakeEl(); c.tag = tag; c.cls = o?.cls ?? ""; c.text = o?.text ?? ""; c.attr = o?.attr ?? {}; el.children.push(c); return c; };
  el.createDiv = (o?: any) => make("div", o);
  el.createEl = (tag: string, o?: any) => make(tag, o);
  el.createSpan = (o?: any) => make("span", o);
  el.createSvg = (tag: string, o?: any) => make(tag, o);
  return el;
}
const all = (el: any): any[] => [el, ...el.children.flatMap(all)];

const cache: HealthCache = {
  version: 5, sourceFile: "", importedAt: "", recordCount: 0, skippedCount: 0, dateRange: null, metrics: {}, workouts: [],
  activity: { "2026-06-30": { moveKcal: 250, moveGoalKcal: 500, exerciseMin: 45, exerciseGoalMin: 30, standHours: 12, standGoalHours: 12 } },
};

describe("renderActivityRings", () => {
  beforeEach(() => { registerI18n(); setLang("en"); });

  it("drei Ringe mit Name für Screenreader, Wert, Ziel und Prozent als Text (zweiter Kanal)", () => {
    const el = fakeEl();
    renderActivityRings(el, buildActivityVM(cache)!);
    const svgs = all(el).filter((n) => n.tag === "svg");
    expect(svgs.map((s) => s.attr["aria-label"])).toEqual([
      "Move: 250 kcal of 500 kcal, 50%", "Exercise: 45 min of 30 min, 150%", "Stand: 12 h of 12 h, 100%",
    ]);
    const texts = all(el).map((n) => n.text);
    expect(texts).toContain("250 kcal");
    expect(texts).toContain("of 500 kcal · 50%");
    expect(all(el).filter((n) => n.cls.includes("is-closed")).length).toBe(2);
  });

  it("Bogenlänge folgt dem Anteil (gekappt bei 1)", () => {
    const el = fakeEl();
    renderActivityRings(el, buildActivityVM(cache)!);
    const arcs = all(el).filter((n) => n.cls === "ah-ring-arc").map((n) => n.attr["stroke-dasharray"].split(" ").map(Number));
    const [half, full, stand] = arcs;
    expect(half[0] / half[1]).toBeCloseTo(0.5, 2);
    expect(full[0]).toBeCloseTo(full[1], 1);
    expect(stand[0]).toBeCloseTo(stand[1], 1);
  });
});
