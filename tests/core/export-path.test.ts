import { buildExportName, sanitizeBase } from "../../src/core/export-path";
import { joinVaultPath } from "../../src/vendor/kit/vault-path";

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

// Seit Kit 0.27.0 kommt die Rechnung aus `vendor/kit/vault-path.ts`. Die drei
// Zusicherungen der frueheren lokalen `joinPath` gelten dort unveraendert; der vierte
// Fall pinnt, was NEU ist — interne Mehrfach-Slashes kollabieren jetzt. Das ist keine
// Kosmetik: der Ordner kommt roh aus einem Freitextfeld (tabs/detail.ts).
describe("joinVaultPath", () => {
  it("fügt Ordner und Datei zusammen", () => {
    expect(joinVaultPath("30_Health", "a.md")).toBe("30_Health/a.md");
  });

  it("leerer Ordner bedeutet Vault-Wurzel", () => {
    expect(joinVaultPath("", "a.md")).toBe("a.md");
  });

  it("räumt führende und schließende Slashes weg", () => {
    expect(joinVaultPath("/30_Health/", "a.md")).toBe("30_Health/a.md");
  });

  it("kollabiert interne Mehrfach-Slashes (neu gegenüber joinPath)", () => {
    expect(joinVaultPath("a//b", "x.md")).toBe("a/b/x.md");
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
