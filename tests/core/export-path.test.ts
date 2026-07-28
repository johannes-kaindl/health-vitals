import { buildExportName, joinPath, sanitizeBase } from "../../src/core/export-path";

describe("sanitizeBase", () => {
  it("entfernt dateisystem-verbotene Zeichen", () => {
    expect(sanitizeBase('a/b\\c:d*e?f"g<h>i|j')).toBe("abcdefghij");
  });

  it("trimmt Rand-Leerzeichen", () => {
    expect(sanitizeBase("  Ruhepuls  ")).toBe("Ruhepuls");
  });

  it("leerer Rest ergibt einen Ersatznamen statt eines leeren Dateinamens", () => {
    expect(sanitizeBase("///")).toBe("Export");
  });
});

describe("joinPath", () => {
  it("fügt Ordner und Datei zusammen", () => {
    expect(joinPath("30_Health", "a.md")).toBe("30_Health/a.md");
  });

  it("leerer Ordner bedeutet Vault-Wurzel", () => {
    expect(joinPath("", "a.md")).toBe("a.md");
  });

  it("räumt führende und schließende Slashes weg", () => {
    expect(joinPath("/30_Health/", "a.md")).toBe("30_Health/a.md");
  });
});

describe("buildExportName", () => {
  it("Metrik plus Zeitraum, ohne Endung", () => {
    expect(buildExportName("Ruhepuls", "2026-06-28", "2026-07-28"))
      .toBe("Ruhepuls 2026-06-28–2026-07-28");
  });

  it("säubert einen Metriknamen mit Sonderzeichen", () => {
    expect(buildExportName("A/B", "2026-01", "2026-02")).toBe("AB 2026-01–2026-02");
  });
});
