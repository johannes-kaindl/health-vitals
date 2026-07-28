import { collapsibleSection, resolveCollapsed } from "../../src/vendor/kit-obsidian/collapsible";

function fakeEl(): any {
  const el: any = {
    children: [] as any[], cls: "", text: "", handlers: {} as Record<string, any>, attrs: {} as Record<string, string>,
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(_t: string, o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || ""; el.children.push(c); return c; },
    setAttribute(n: string, v: string) { el.attrs[n] = v; },
    addEventListener(ev: string, cb: any) { el.handlers[ev] = cb; },
    toggleClass() {}, addClass() {}, setText() {},
  };
  return el;
}

describe("collapsibleSection (vendored)", () => {
  it("gibt den Body-Container zurück", () => {
    const host = fakeEl();
    const body = collapsibleSection(host, { title: "Werte" });
    expect(body).toBeTruthy();
  });

  it("Klick auf den Header meldet den neuen Zustand an den Storage", () => {
    const host = fakeEl();
    const saved: Array<[string, boolean]> = [];
    collapsibleSection(host, {
      title: "Werte", key: "detail-values", defaultCollapsed: true,
      storage: { getCollapsed: () => undefined, setCollapsed: (k, c) => { saved.push([k, c]); } },
    });
    const header = host.children[0].children[0];
    header.handlers.click();
    expect(saved).toEqual([["detail-values", false]]);
  });

  it("persistierter Zustand schlägt den Default", () => {
    expect(resolveCollapsed("k", true, { getCollapsed: () => false, setCollapsed() {} })).toBe(false);
    expect(resolveCollapsed("k", false, { getCollapsed: () => undefined, setCollapsed() {} })).toBe(false);
  });
});
