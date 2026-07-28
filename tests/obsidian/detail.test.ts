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
    removeClass() {},
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
  version: 1, sourceFile: "", importedAt: "", recordCount: 2, skippedCount: 0,
  // dateRange reicht bis Februar, damit der zweite Datenpunkt (für den CSV-vs-Markdown-Test
  // unten gebraucht) bei range "all" nicht durch resolveRange herausgefiltert wird.
  dateRange: { from: "2026-01-01", to: "2026-02-05" },
  metrics: { HKQuantityTypeIdentifierStepCount: { unit: "count", policy: "sum", daily: {
    "2026-01-10": { sum: 500, count: 1 },
    // Wert > 1000 in einem eigenen Monat: formatValue rendert ihn deutsch als "1.500"
    // (Tausenderpunkt), rawCell als "1500" — nur damit divergieren rows/rowsRaw sichtbar
    // und ein versehentliches toCsv(headers, rows) statt rowsRaw fiele im Test auf.
    "2026-02-05": { sum: 1500, count: 1 },
  } } },
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

describe("renderDetail — Export-Zeile", () => {
  it("Buttons, Format-Umschalter und Ordner-Feld sind da", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    expect(findText(el, "Kopieren")).toBe(true);
    expect(findText(el, "Speichern")).toBe(true);
    expect(findText(el, "MD")).toBe(true);
    expect(findText(el, "CSV")).toBe(true);
    expect(findText(el, "Ordner")).toBe(true);
  });

  it("Klick auf CSV meldet das Format an den Host", () => {
    const view = fakeView();
    const seen: string[] = [];
    view.host.setExportFormat = (f: string) => seen.push(f);
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, view);
    findByText(el, "CSV")._click();
    expect(seen).toEqual(["csv"]);
  });

  it("Kopieren schreibt die Markdown-Tabelle in die Zwischenablage", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    findByText(el, "Kopieren")._click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    // range "all" rollt auf Monatsgranularität hoch (resolveRange, s. Task 13), daher
    // "Monat" statt "Datum" im Kopf — siehe "Tabelle trägt Kopfzeile..." oben im selben Setup.
    expect(writeText.mock.calls[0][0]).toContain("| Monat |");
    vi.unstubAllGlobals();
  });

  it("bei CSV-Format kopiert derselbe Button eine CSV mit ROHEN Zahlen", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const view = fakeView();
    view.host.getExportFormat = () => "csv";
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, view);
    findByText(el, "Kopieren")._click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    const out = writeText.mock.calls[0][0];
    expect(out).not.toContain("|");
    // Der eigentliche Punkt: CSV muss aus rowsRaw stammen. Auf Deutsch formatiert
    // formatValue 1500 zu "1.500" — der Punkt als Tausendertrenner. Nur ein Wert
    // ÜBER 1000 im Fixture macht eine Vertauschung von rows/rowsRaw überhaupt
    // sichtbar; bei kleinen Zahlen sind beide Zeilensätze identisch und der Test
    // wäre auch mit vertauschten Argumenten grün.
    expect(out).toContain("1500");
    expect(out).not.toContain("1.500");
    vi.unstubAllGlobals();
  });
});

describe("renderDetail — Speichern (Export ins Vault, I-4)", () => {
  // Der Kopieren-Pfad hat zwei End-to-End-Tests (oben); der Speichern-Pfad
  // (detail.ts save(), Z. 124-137) hatte keinen — vertauschte Argumente an
  // writeExport() oder ein falsch abgeleitetes from/to wären grün durchgelaufen.
  function makeVaultView(folder: string, format: "md" | "csv"): {
    view: any; write: ReturnType<typeof vi.fn>; exists: ReturnType<typeof vi.fn>; mkdir: ReturnType<typeof vi.fn>;
  } {
    const write = vi.fn().mockResolvedValue(undefined);
    const exists = vi.fn().mockResolvedValue(false); // Ordner "existiert" schon, kein mkdir; Zielpfad ist frei
    const mkdir = vi.fn().mockResolvedValue(undefined);
    const view = fakeView();
    view.app = { vault: { adapter: { exists, mkdir, write } } };
    view.host.getExportFolder = () => folder;
    view.host.getExportFormat = () => format;
    return { view, write, exists, mkdir };
  }

  it("CSV: schreibt in den gewählten Ordner, Dateiname aus Metrik+Zeitraum, Endung .csv, Inhalt aus rowsRaw", async () => {
    const { view, write } = makeVaultView("30_Health/Exporte", "csv");
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, view);
    findByText(el, "Speichern")._click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    const [path, content] = write.mock.calls[0];
    // Ordner + Metrikname + von–bis (Monatsschlüssel bei range "all", s. Tabellen-Test oben) + Endung.
    expect(path).toBe("30_Health/Exporte/Schritte 2026-01–2026-02.csv");
    expect(content).not.toContain("|");
    expect(content).toContain("1500");
    expect(content).not.toContain("1.500");
  });

  it("Markdown: gleicher Knopf, anderer Ordner, Endung .md, Inhalt aus rows (formatiert)", async () => {
    const { view, write } = makeVaultView("Notes", "md");
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, view);
    findByText(el, "Speichern")._click();
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    const [path, content] = write.mock.calls[0];
    expect(path).toBe("Notes/Schritte 2026-01–2026-02.md");
    expect(content).toContain("| Monat |");
    expect(content).toContain("1.500");
  });
});
