import { renderOverview } from "../../src/obsidian/tabs/overview";
import type { HealthCache } from "../../src/core/types";

function fakeEl(): any {
  const el: any = { children: [] as any[], cls: "", text: "", tag: "", attrs: {} as any, dataset: {} as any,
    _handlers: {} as any, open: false, focused: false,
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(t: string, o?: any) { const c = fakeEl(); c.tag = t; c.cls = (o && o.cls) || ""; c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSvg(tag: string) { const c = fakeEl(); c.tag = tag; el.children.push(c); return c; },
    addEventListener(ev: string, cb: any) { (el._handlers[ev] ||= []).push(cb); },
    // `open` ist ein reflektiertes Attribut: setAttribute("open") setzt im echten DOM auch
    // die Property. Ohne diese Spiegelung läse der toggle-Handler eine offene Sektion als
    // geschlossen, und der Test des Echo-Guards würde am Mock scheitern statt am Code.
    setAttribute(k: string, v: string) { el.attrs[k] = v; if (k === "open") el.open = true; },
    toggleClass() {}, addClass() {}, focus() { el.focused = true; },
    _fire(ev: string, arg?: any) { for (const cb of (el._handlers[ev] || [])) cb(arg); },
  };
  return el;
}
function countClass(el: any, cls: string): number {
  let n = el.cls === cls ? 1 : 0;
  for (const c of el.children) n += countClass(c, cls);
  return n;
}
function findByClass(el: any, cls: string): any[] {
  const out: any[] = el.cls === cls ? [el] : [];
  for (const c of el.children) out.push(...findByClass(c, cls));
  return out;
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

/** Host mit dem echten CollapsibleStorage-Verhalten: `undefined` heißt „nichts gespeichert". */
function makeView(stored: Record<string, boolean> = {}): any {
  const writes: Array<[string, boolean]> = [];
  const view: any = {
    openDetail() {}, refreshOverview() {},
    contentEl: fakeEl(),
    host: {
      getFavorites: () => [],
      toggleFavorite: async () => {},
      getCollapsed: (k: string) => stored[k],
      setCollapsed: (k: string, v: boolean) => { stored[k] = v; writes.push([k, v]); },
    },
    _writes: writes,
  };
  return view;
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

const KEY_BODY = "overview-cat:body";
const KEY_ACTIVITY = "overview-cat:activity";

function sections(el: any): { aktiv: any; koerper: any } {
  const details = findByTag(el, "details");
  return {
    aktiv: details.find((d) => summaryText(d).startsWith("Aktivität")),
    koerper: details.find((d) => summaryText(d).startsWith("Körper")),
  };
}

describe("renderOverview", () => {
  it("rendert eine Kachel pro Metrik", () => {
    const el = fakeEl();
    renderOverview(el, cache, makeView());
    expect(countClass(el, "ah-tile")).toBe(2);
  });

  it("zeigt Hinweis, wenn der Cache keine Metriken hat", () => {
    const el = fakeEl();
    const emptyCache = { ...cache, metrics: {} };
    renderOverview(el, emptyCache, makeView());
    expect(countClass(el, "ah-detail-hint")).toBe(1);
  });

  it("ohne gespeicherten Zustand steht die erste Kategorie offen, der Rest zu", () => {
    const el = fakeEl();
    renderOverview(el, cache, makeView());
    const { aktiv, koerper } = sections(el);
    expect(aktiv.attrs.open).toBeDefined();
    expect(koerper.attrs.open).toBeUndefined();
  });

  it("gespeicherter Zustand schlägt den Default — in beide Richtungen", () => {
    const el = fakeEl();
    renderOverview(el, cache, makeView({ [KEY_ACTIVITY]: true, [KEY_BODY]: false }));
    const { aktiv, koerper } = sections(el);
    expect(aktiv.attrs.open).toBeUndefined(); // gespeichert: eingeklappt
    expect(koerper.attrs.open).toBeDefined(); // gespeichert: aufgeklappt
  });

  it("toggle schreibt den neuen Zustand in den Speicher", () => {
    const view = makeView();
    const el = fakeEl();
    renderOverview(el, cache, view);
    const { koerper } = sections(el);
    koerper.open = true; koerper._fire("toggle");
    expect(view.host.getCollapsed(KEY_BODY)).toBe(false);
    koerper.open = false; koerper._fire("toggle");
    expect(view.host.getCollapsed(KEY_BODY)).toBe(true);
  });

  it("der Zustand überlebt einen Re-Render (Regression Favoriten-Toggle)", () => {
    const view = makeView();
    const first = fakeEl();
    renderOverview(first, cache, view);
    sections(first).koerper.open = true;
    sections(first).koerper._fire("toggle");

    const second = fakeEl();
    renderOverview(second, cache, view);
    expect(sections(second).koerper.attrs.open).toBeDefined();
  });

  it("der Render selbst schreibt nichts — nur echte Zustandswechsel", () => {
    // Das Setzen des open-Attributs stößt ein toggle-Event an. Ohne Guard schriebe jeder
    // Render data.json neu, obwohl der Nutzer nichts angefasst hat.
    const view = makeView();
    const el = fakeEl();
    renderOverview(el, cache, view);
    for (const d of findByTag(el, "details")) d._fire("toggle");
    expect(view._writes).toEqual([]);
  });

  it("Kachel und Stern sind per Tastatur erreichbar und auslösbar", () => {
    const view = makeView();
    const el = fakeEl();
    renderOverview(el, cache, view);

    const tile = findByClass(el, "ah-tile")[0];
    const star = findByClass(el, "ah-tile-star")[0];
    for (const target of [tile, star]) {
      expect(target.attrs.role).toBe("button");
      expect(target.attrs.tabindex).toBe("0");
    }

    let opened: string | null = null;
    view.openDetail = (id: string) => { opened = id; };
    let prevented = false, stopped = false;
    tile._fire("keydown", { key: "Enter", preventDefault: () => { prevented = true; }, stopPropagation: () => { stopped = true; } });
    expect(opened).not.toBeNull();
    expect(prevented && stopped).toBe(true);
  });

  it("andere Tasten lösen die Kachel nicht aus", () => {
    const view = makeView();
    const el = fakeEl();
    renderOverview(el, cache, view);
    let opened = false;
    view.openDetail = () => { opened = true; };
    findByClass(el, "ah-tile")[0]._fire("keydown", { key: "a", preventDefault() {}, stopPropagation() {} });
    expect(opened).toBe(false);
  });

  it("der Stern trägt seine Metrik-ID, damit der Fokus den Re-Render überlebt", () => {
    const el = fakeEl();
    renderOverview(el, cache, makeView());
    const ids = findByClass(el, "ah-tile-star").map((s: any) => s.dataset.metric);
    expect(ids).toContain("HKQuantityTypeIdentifierStepCount");
    expect(ids).toContain("HKQuantityTypeIdentifierBodyMass");
  });
});
