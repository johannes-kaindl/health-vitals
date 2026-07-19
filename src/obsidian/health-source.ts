import { createReadStream, type ReadStream } from "node:fs";
import { basename } from "node:path";
import { Unzip, AsyncUnzipInflate } from "fflate";

/** Jüngste .zip/.xml aus einer Dateinamensliste (lexikografisch letzte). */
export function pickImportFile(names: string[]): string | null {
  const candidates = names.filter((n) => n.endsWith(".zip") || n.endsWith(".xml")).sort();
  return candidates.length ? candidates[candidates.length - 1] : null;
}

/** True, wenn der Zip-Eintrag die Export.xml ist (egal in welchem Ordner). */
export function isExportEntry(name: string): boolean {
  return basename(name) === "Export.xml";
}

/** UTF-8-Chunks des Export-XML — .zip wird streamend entpackt, .xml direkt gelesen. */
export function openImportSource(absPath: string): AsyncIterable<string> {
  return absPath.endsWith(".zip") ? readZip(absPath) : readXml(absPath);
}

async function* readXml(absPath: string): AsyncIterable<string> {
  const stream = createReadStream(absPath, { encoding: "utf8" });
  for await (const chunk of stream) yield chunk as string;
}

function readZip(absPath: string): AsyncIterable<string> {
  const decoder = new TextDecoder("utf-8");
  const queue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  let error: unknown = null;
  let rs: ReadStream | null = null;

  const wake = (): void => { if (resolveNext) { const r = resolveNext; resolveNext = null; r(); } };
  const push = (s: string): void => {
    queue.push(s);
    if (queue.length > 64 && rs && !rs.isPaused()) rs.pause(); // Backpressure
    wake();
  };
  const finish = (): void => { done = true; rs?.destroy(); wake(); };
  const fail = (e: unknown): void => { error = e; done = true; rs?.destroy(); wake(); };

  const unzip = new Unzip((file) => {
    if (!isExportEntry(file.name)) return; // andere Einträge (GPX) ignorieren, nicht starten
    file.ondata = (err, data, final): void => {
      if (err) { fail(err); return; }
      if (data && data.length) push(decoder.decode(data, { stream: !final }));
      if (final) finish();
    };
    file.start();
  });
  unzip.register(AsyncUnzipInflate);

  rs = createReadStream(absPath);
  rs.on("data", (c) => { try { unzip.push(new Uint8Array(c as Buffer), false); } catch (e) { fail(e); } });
  rs.on("end", () => { try { unzip.push(new Uint8Array(0), true); } catch (e) { fail(e); } });
  rs.on("error", fail);

  return {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (queue.length) {
          const s = queue.shift() as string;
          if (queue.length < 16 && rs && rs.isPaused()) rs.resume();
          yield s;
          continue;
        }
        if (error) throw error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
        if (done) return;
        await new Promise<void>((res) => { resolveNext = res; });
      }
    },
  };
}
