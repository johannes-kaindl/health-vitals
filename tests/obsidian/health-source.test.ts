import { pickImportFile, isExportEntry } from "../../src/obsidian/health-source";

describe("health-source Helper", () => {
  it("pickImportFile wählt die jüngste .zip/.xml", () => {
    expect(pickImportFile(["2025-01-01_Health.zip", "2026-07-17_Health.zip", "notes.md"]))
      .toBe("2026-07-17_Health.zip");
    expect(pickImportFile(["export.xml"])).toBe("export.xml");
    expect(pickImportFile(["readme.md", "data.json"])).toBeNull();
    expect(pickImportFile([])).toBeNull();
  });

  it("isExportEntry matcht nur den Export.xml-Basename", () => {
    expect(isExportEntry("apple_health_export/Export.xml")).toBe(true);
    expect(isExportEntry("Export.xml")).toBe(true);
    expect(isExportEntry("apple_health_export/workout-routes/route.gpx")).toBe(false);
  });
});
