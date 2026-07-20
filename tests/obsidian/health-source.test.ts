import { zipSync, strToU8 } from "fflate";
import { isExportEntry, openImportSource } from "../../src/obsidian/health-source";

const XML = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
  + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';

async function collect(src: AsyncIterable<string>): Promise<string> {
  let out = "";
  for await (const chunk of src) out += chunk;
  return out;
}

/** ReadableStream, die `bytes` in festen (winzigen) Häppchen ausliefert. */
function chunkedByteStream(bytes: Uint8Array, chunkSize: number): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(i, i + chunkSize));
      i += chunkSize;
    },
  });
}

/**
 * File, dessen stream() nicht der Laufzeit überlassen wird, sondern gezielt
 * in `chunkSize`-Byte-Häppchen liefert — bei chunkSize 1 wird garantiert jedes
 * Mehrbyte-UTF-8-Zeichen über zwei `reader.read()`-Aufrufe zerschnitten.
 */
function fileWithChunkedStream(bytes: Uint8Array, name: string, chunkSize: number): File {
  const file = new File([bytes], name);
  Object.defineProperty(file, "stream", { value: () => chunkedByteStream(bytes, chunkSize) });
  return file;
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
    // Mehrbyte-Zeichen (2/3/4-Byte-UTF-8), die bei 1-Byte-Chunks garantiert
    // mitten im Zeichen geschnitten werden. file.stream() liefert diese
    // kleine XML sonst als einzelnen Chunk aus — daher die erzwungene Chunkung.
    const xml = `<HealthData><Record device="Größenmessgerät äöü 中文 🎉" /></HealthData>`;
    const bytes = new TextEncoder().encode(xml);
    const file = fileWithChunkedStream(bytes, "Export.xml", 1);
    expect(await collect(openImportSource(file))).toBe(xml);
  });

  it("dekodiert UTF-8 in der Zip korrekt über Chunk-Grenzen hinweg", async () => {
    // Gleiche Erzwingung wie oben, aber auf den komprimierten Bytes: 1-Byte-
    // Häppchen an unzip.push() lassen fflates Inflate die Ausgabe ebenfalls in
    // winzigen (teils 1-Byte-)Stücken an entry.ondata liefern, was Mehrbyte-
    // Zeichen über zwei ondata-Aufrufe zerschneidet.
    const xml = `<HealthData><Record device="Größenmessgerät äöü 中文 🎉" /></HealthData>`;
    const zipped = zipSync({ "Export.xml": strToU8(xml) });
    const file = fileWithChunkedStream(zipped, "export.zip", 1);
    expect(await collect(openImportSource(file))).toBe(xml);
  });
});
