import { HealthVitalsSettingTab, type SettingsHost } from "../../src/obsidian/settings-tab";
import { EN, DE, registerI18n } from "../../src/i18n/strings";
import { setLang } from "../../src/vendor/kit/i18n";

function makeHost(over: Partial<SettingsHost> = {}): SettingsHost & { folder: string; format: "md" | "csv" } {
  const h: any = {
    folder: "Health", format: "md",
    getExportFolder() { return h.folder; },
    setExportFolder(v: string) { h.folder = v; },
    getExportFormat() { return h.format; },
    setExportFormat(f: "md" | "csv") { h.format = f; },
    ...over,
  };
  return h;
}

/** Alle Zeilen, die `display()` angelegt hat, in Reihenfolge. */
function rows(tab: HealthVitalsSettingTab): any[] {
  const out: any[] = [];
  for (const el of (tab.containerEl as any).children ?? []) if (el.__setting) out.push(el.__setting);
  return out;
}

describe("HealthVitalsSettingTab", () => {
  beforeEach(() => { registerI18n(); setLang("en"); });

  it("erste Zeile ist die Hilfe-Zeile (§8), danach Export-Ordner und -Format", () => {
    const tab = new HealthVitalsSettingTab({} as any, {} as any, makeHost());
    tab.display();
    const r = rows(tab);
    expect(r.map((s) => s.nameValue)).toEqual(["Help", EN["settings.exportFolder.name"], EN["settings.exportFormat.name"]]);
    const help = r[0] as any;
    expect(help.components.some((c: any) => c.textValue === "Open documentation")).toBe(true);
    expect(help.components.some((c: any) => c.iconName === "bug")).toBe(true);
  });

  it("Hilfe-Zeile folgt der Oberflächensprache", () => {
    setLang("de");
    const tab = new HealthVitalsSettingTab({} as any, {} as any, makeHost());
    tab.display();
    expect(rows(tab)[0].nameValue).toBe("Hilfe");
    expect(rows(tab)[1].nameValue).toBe(DE["settings.exportFolder.name"]);
  });

  it("Ordner: zeigt den gespeicherten Wert, speichert verzögert und beim Schließen sofort", () => {
    vi.useFakeTimers();
    try {
      const host = makeHost();
      const tab = new HealthVitalsSettingTab({} as any, {} as any, host);
      tab.display();
      const text = (rows(tab)[1] as any).components[0];
      expect(text.getValue()).toBe("Health");
      // Tastenanschläge: kein Schreibvorgang je Zeichen, nur der letzte Stand zählt.
      text.onChangeCB("G"); text.onChangeCB("Ge"); text.onChangeCB("Gesundheit/Export");
      expect(host.folder).toBe("Health");
      vi.advanceTimersByTime(500);
      expect(host.folder).toBe("Gesundheit/Export");
      // Schließen des Tabs speichert ohne Wartezeit.
      text.onChangeCB("Neu");
      tab.hide();
      expect(host.folder).toBe("Neu");
    } finally {
      vi.useRealTimers();
    }
  });

  it("deklarative Definition (Einstellungs-Suche ab 1.13): Hilfe zuerst, dann beide Schlüssel", () => {
    const tab = new HealthVitalsSettingTab({} as any, {} as any, makeHost());
    const defs = tab.getSettingDefinitions() as any[];
    expect(defs[0].name).toBe("Help");
    expect(defs.slice(1).map((d) => d.control.key)).toEqual(["exportFolder", "exportFormat"]);
  });

  it("Format: Dropdown mit beschrifteten Optionen, Wahl landet im Host", () => {
    const host = makeHost();
    const tab = new HealthVitalsSettingTab({} as any, {} as any, host);
    tab.display();
    const dd = (rows(tab)[2] as any).components[0];
    expect(dd.options).toEqual({ md: EN["export.format.md"], csv: EN["export.format.csv"] });
    expect(dd.getValue()).toBe("md");
    dd.onChangeCB("csv");
    expect(host.format).toBe("csv");
  });

  it("jede Einstellungs-Beschriftung hat EN und DE", () => {
    for (const k of Object.keys(EN).filter((k) => k.startsWith("settings.") || k.startsWith("export.format."))) {
      expect(DE[k]).toBeTruthy();
    }
  });
});
