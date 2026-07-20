import { zipSync, strToU8 } from "fflate";
import { isExportEntry, openImportSource } from "../../src/obsidian/health-source";

const XML = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
  + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';

async function collect(src: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of src) out += chunk;
  return out;
}

describe("isExportEntry", () => {
  it("erkennt Export.xml in jedem Unterordner, ohne node:path", () => {
    expect(isExportEntry("Export.xml")).toBe(true);
    expect(isExportEntry("apple_health_export/Export.xml")).toBe(true);
    expect(isExportEntry("a/b/c/Export.xml")).toBe(true);
    expect(isExportEntry("apple_health_export/export.xml")).toBe(false);
    expect(isExportEntry("workout-routes/route.gpx")).toBe(false);
    expect(isExportEntry("NotExport.xml")).toBe(false);
  });
});

describe("openImportSource", () => {
  it("liest eine plain .xml über den File-Stream", async () => {
    const file = new File([XML], "Export.xml", { type: "text/xml" });
    expect(await collect(openImportSource(file))).toBe(XML);
  });

  it("entpackt Export.xml aus einer .zip und ignoriert andere Einträge", async () => {
    const zipped = zipSync({
      "apple_health_export/Export.xml": strToU8(XML),
      "apple_health_export/workout-routes/route.gpx": strToU8("<gpx/>"),
    });
    const file = new File([zipped], "export.zip", { type: "application/zip" });
    expect(await collect(openImportSource(file))).toBe(XML);
  });

  it("meldet eine Zip ohne Export.xml als Fehler", async () => {
    const zipped = zipSync({ "readme.txt": strToU8("nichts hier") });
    const file = new File([zipped], "export.zip");
    await expect(collect(openImportSource(file))).rejects.toThrow(/Export\.xml/);
  });

  it("dekodiert UTF-8 korrekt über Chunk-Grenzen hinweg", async () => {
    // Mehrbyte-Zeichen, die bei ungünstiger Chunkung zerschnitten würden.
    const xml = `<HealthData><Record device="Größenmessgerät äöü" /></HealthData>`;
    const file = new File([xml], "Export.xml");
    expect(await collect(openImportSource(file))).toBe(xml);
  });
});
