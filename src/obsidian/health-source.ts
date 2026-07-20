import { Unzip, UnzipInflate } from "fflate";

/**
 * True, wenn der Zip-Eintrag die Export.xml ist (egal in welchem Ordner).
 * Bewusst ohne `node:path` — jeder verbliebene node:-Import würde die
 * obsidianmd-Regel `no-nodejs-modules` weiter auslösen.
 */
export function isExportEntry(name: string): boolean {
  return name.slice(name.lastIndexOf("/") + 1) === "Export.xml";
}

/** UTF-8-Chunks des Export-XML — .zip wird streamend entpackt, .xml direkt gelesen. */
export function openImportSource(file: File): AsyncIterable<string> {
  return file.name.endsWith(".zip") ? readZip(file) : readXml(file);
}

/**
 * Stellt sicher, dass wirklich ein Error-Objekt geworfen wird (@typescript-eslint/only-throw-error).
 * fflates ondata-Callback liefert `err` als `unknown` — hier landen also potenziell
 * Nicht-Error-Werte, die sonst unverändert durchgereicht würden.
 */
function toError(failure: unknown): Error {
  return failure instanceof Error ? failure : new Error(String(failure));
}

async function* readXml(file: File): AsyncIterable<string> {
  const decoder = new TextDecoder("utf-8");
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // stream: true hält Mehrbyte-Zeichen über Chunk-Grenzen hinweg zusammen.
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

async function* readZip(file: File): AsyncIterable<string> {
  const decoder = new TextDecoder("utf-8");
  let pending: string[] = [];
  let matched = false;
  let failure: unknown = null;

  const unzip = new Unzip((entry) => {
    if (!isExportEntry(entry.name)) return; // GPX u.a. gar nicht erst starten
    matched = true;
    entry.ondata = (err, data, final): void => {
      if (err) { failure = err; return; }
      if (data.length) pending.push(decoder.decode(data, { stream: !final }));
    };
    entry.start();
  });
  // Synchroner Inflate (NICHT AsyncUnzipInflate): fflates Async-Variante spawnt einen
  // Web-Worker, den Obsidians Electron-Renderer nicht erlaubt ("Failed to construct
  // 'Worker'"). Backpressure entsteht hier natürlich — wir lesen den nächsten Chunk
  // erst, wenn der Consumer die vorigen abgeholt hat.
  unzip.register(UnzipInflate);

  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      unzip.push(value, false);
      if (failure) throw toError(failure);
      if (pending.length) { const out = pending; pending = []; yield* out; }
    }
    unzip.push(new Uint8Array(0), true);
    if (failure) throw toError(failure);
    if (pending.length) yield* pending;
    if (!matched) throw new Error("Export.xml nicht im Zip gefunden");
  } finally {
    reader.releaseLock();
  }
}
