import { EN, DE, registerI18n, localeTag } from "../../src/i18n/strings";
import { setLang, t } from "../../src/vendor/kit/i18n";

describe("strings", () => {
  it("EN und DE haben identische Keysets (Parität)", () => {
    const en = Object.keys(EN).sort();
    const de = Object.keys(DE).sort();
    expect(de).toEqual(en);
  });

  it("registerI18n + setLang liefert die richtige Sprache, EN als Fallback", () => {
    registerI18n();
    setLang("de");
    expect(t("tab.overview")).toBe("Übersicht");
    setLang("en");
    expect(t("tab.overview")).toBe("Overview");
    expect(t("does.not.exist")).toBe("does.not.exist"); // Key-Fallback
  });

  it("t substituiert Positionsargumente", () => {
    registerI18n();
    setLang("en");
    expect(t("a11y.openMetric", "Steps")).toBe("Open Steps");
    expect(t("import.records", 1234)).toBe("1234 records");
  });

  it("localeTag folgt der aktiven Sprache", () => {
    setLang("de");
    expect(localeTag()).toBe("de-DE");
    setLang("en");
    expect(localeTag()).toBe("en-US");
  });

  it("Achsen-, Tabellen- und Export-Keys sind in beiden Sprachen belegt", () => {
    const keys = [
      "axis.week", "table.title", "table.colDate", "table.colWeek",
      "table.colMonth", "table.colValue", "export.copy", "export.save",
      "export.folder", "export.copied", "export.copyFailed",
      "export.saved", "export.saveFailed",
    ];
    for (const k of keys) {
      expect(EN[k], `EN fehlt: ${k}`).toBeTruthy();
      expect(DE[k], `DE fehlt: ${k}`).toBeTruthy();
    }
  });

  it("Platzhalter-Keys tragen ihren {0}-Slot in beiden Sprachen", () => {
    for (const k of ["export.copied", "export.saved", "export.saveFailed"]) {
      expect(EN[k]).toContain("{0}");
      expect(DE[k]).toContain("{0}");
    }
  });
});
