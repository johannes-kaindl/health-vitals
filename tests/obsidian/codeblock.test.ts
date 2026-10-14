import { HealthBlock, type BlockHost, type CacheRead } from "../../src/obsidian/codeblock";
import type { HealthCache } from "../../src/core/types";
import { registerI18n } from "../../src/i18n/strings";
import { setLang } from "../../src/vendor/kit/i18n";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "", classes: [] as string[],
    empty() { el.children.length = 0; },
    addClass(c: string) { el.classes.push(c); },
    createDiv(o?: any) { const c = fakeEl(); c.cls = o?.cls ?? ""; c.text = o?.text ?? ""; el.children.push(c); return c; },
    createEl(tag: string, o?: any) { const c = fakeEl(); c.tag = tag; c.cls = o?.cls ?? ""; c.text = o?.text ?? ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.cls = o?.cls ?? ""; c.text = o?.text ?? ""; el.children.push(c); return c; },
    createSvg(tag: string, o?: any) { const c = fakeEl(); c.tag = tag; c.cls = o?.cls ?? ""; el.children.push(c); return c; },
    setCssStyles() {}, addEventListener() {}, setAttribute() {},
  };
  return el;
}
const texts = (el: any): string[] => [el.text, ...el.children.flatMap(texts)].filter(Boolean);
const count = (el: any, cls: string): number => (el.cls.split(" ").includes(cls) ? 1 : 0) + el.children.reduce((n: number, c: any) => n + count(c, cls), 0);

const cache: HealthCache = {
  version: 5, sourceFile: "", importedAt: "", recordCount: 3, skippedCount: 0,
  dateRange: { from: "2026-06-01", to: "2026-06-03" }, workouts: [],
  metrics: { HKQuantityTypeIdentifierStepCount: { unit: "count", policy: "sum", daily: {
    "2026-06-01": { sum: 100, count: 1 }, "2026-06-02": { sum: 200, count: 1 }, "2026-06-03": { sum: 300, count: 1 } } } },
};

function makeHost(read: CacheRead) {
  const listeners = new Set<() => void>();
  const host: BlockHost & { read: CacheRead; fire(): void } = {
    read,
    readCache: async () => host.read,
    onCacheChanged: (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    fire: () => { for (const l of [...listeners]) l(); },
  };
  return { host, listeners };
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("HealthBlock", () => {
  beforeEach(() => { registerI18n(); setLang("en"); });

  it("rendert ein Chart und die Kennzahlen", async () => {
    const box = fakeEl();
    const { host } = makeHost({ cache, state: "ok" });
    const b = new HealthBlock(box, "metric: StepCount\nrange: 1M", host);
    await b.render();
    expect(count(box, "ah-detail-chart")).toBe(1);
    expect(count(box, "ah-stat-cell")).toBeGreaterThan(0);
    expect(texts(box)).toContain("Steps");
  });

  it("kind: value zeigt nur Kennzahlen, kind: table die Werte-Tabelle", async () => {
    const { host } = makeHost({ cache, state: "ok" });
    const v = fakeEl();
    await new HealthBlock(v, "metric: StepCount\nkind: value", host).render();
    expect(count(v, "ah-detail-chart")).toBe(0);
    expect(count(v, "ah-stat-cell")).toBeGreaterThan(0);
    const t = fakeEl();
    await new HealthBlock(t, "metric: StepCount\nkind: table", host).render();
    expect(count(t, "ah-table-wrap")).toBe(1);
  });

  it("Fehlerfälle stehen als lesbare Zeile im Block, nie als leerer Kasten", async () => {
    const cases: Array<[string, CacheRead, string]> = [
      ["metric: StepCount", { cache: null, state: "missing" }, "No Health data imported yet"],
      ["metric: StepCount", { cache: null, state: "outdated" }, "older version"],
      ["metric: Nope", { cache, state: "ok" }, "no metric \"Nope\""],
      ["", { cache, state: "ok" }, "No metric given"],
      ["metric: StepCount\nrange: 2W", { cache, state: "ok" }, "Unknown range"],
    ];
    for (const [src, read, text] of cases) {
      const box = fakeEl();
      await new HealthBlock(box, src, makeHost(read).host).render();
      expect(texts(box).join(" ")).toContain(text);
      expect(count(box, "ah-block-msg")).toBeGreaterThan(0);
    }
  });

  it("Zeitraum ohne Werte: Zeile statt leerem Chart", async () => {
    const empty = { ...cache, metrics: { HKQuantityTypeIdentifierStepCount: { unit: "count", policy: "sum" as const, daily: {} } } };
    const box = fakeEl();
    await new HealthBlock(box, "metric: StepCount", makeHost({ cache: empty, state: "ok" }).host).render();
    expect(texts(box).join(" ")).toContain("has no values in this range");
  });

  it("zieht nach einem Import nach und meldet sich beim Entladen ab", async () => {
    const box = fakeEl();
    const { host, listeners } = makeHost({ cache: null, state: "missing" });
    const b = new HealthBlock(box, "metric: StepCount", host);
    b.onload();
    await flush();
    expect(texts(box).join(" ")).toContain("No Health data imported yet");
    host.read = { cache, state: "ok" };
    host.fire();
    await flush();
    expect(count(box, "ah-detail-chart")).toBe(1);
    b.onunload();
    expect(listeners.size).toBe(0);
  });
});
