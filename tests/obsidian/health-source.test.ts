import { zipSync, strToU8 } from "fflate";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pickImportFile, isExportEntry, openImportSource } from "../../src/obsidian/health-source";

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

describe("readZip via openImportSource", () => {
  let dir: string;

  afterEach(() => {
    if (dir) { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ } }
  });

  it("lehnt ein Zip ohne Export.xml-Eintrag ab, statt zu hängen", async () => {
    dir = mkdtempSync(join(tmpdir(), "ah-"));
    const zipPath = join(dir, "bad.zip");
    writeFileSync(zipPath, zipSync({ "apple_health_export/other.txt": strToU8("nope") }));

    await expect((async () => {
      for await (const _chunk of openImportSource(zipPath)) {
        /* drain */
      }
    })()).rejects.toThrow(/Export\.xml/);
  });

  it("dekodiert eine Export.xml aus dem Zip zum Original-String", async () => {
    dir = mkdtempSync(join(tmpdir(), "ah-"));
    const zipPath = join(dir, "good.zip");
    const xml = "<HealthData><Record type=\"T\" startDate=\"2022-11-25 08:00:00 +0200\"/></HealthData>";
    writeFileSync(zipPath, zipSync({ "apple_health_export/Export.xml": strToU8(xml) }));

    let out = "";
    for await (const chunk of openImportSource(zipPath)) out += chunk;
    expect(out).toBe(xml);
  });
});
