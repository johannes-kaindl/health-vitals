# Import-Workflow & Store-Konformität — Implementation Plan (Slice 3a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Apple-Health-Export-Datei wird im Dashboard per Datei-Dialog gewählt, der Import läuft sichtbar und abbrechbar, und das Plugin erfüllt die Anforderungen für die Einreichung im Community-Store.

**Architecture:** Reiner Kern (`src/core/`) bekommt einen Zustandsautomaten (`import-state`) und ein abbrechbares `aggregateStream`. Die Obsidian-Schicht (`src/obsidian/`) liest die Datei über `file.stream()` statt `node:fs`, kapselt den Ablauf in einem `ImportController` und rendert ihn in einem neuen Import-Tab. `node:fs`, `node:path` und `getBasePath()` verschwinden vollständig aus dem Plugin.

**Tech Stack:** TypeScript, esbuild, vitest (`environment: "node"`, `globals: true`), fflate, Obsidian Plugin API.

**Spec:** `docs/superpowers/specs/2026-07-20-import-workflow-design.md`

## Global Constraints

- **Kein Web Worker.** `fflate`s `AsyncUnzipInflate` schlägt im Electron-Renderer fehl (`beab394`). Nur `UnzipInflate` (synchron).
- **Kein `node:`-Import in `src/`** nach Task 3. Weder `node:fs` noch `node:path`. Ein einziger verbliebener `node:`-Import lässt `no-nodejs-modules` weiter greifen und macht den Umbau wertlos.
- **`src/core/` bleibt dependency-frei** — kein `obsidian`-Import, kein DOM, kein `setTimeout`. Nebeneffekte werden von außen hereingereicht.
- **Kein Inline-`// eslint-disable`.** Genuin unvermeidbare Ausnahmen nur als file-scoped Override in `eslint.config.mjs` mit Begründung (Vorgabe aus der bestehenden Config).
- **UI-Texte bleiben deutsch** (wie der Bestand). i18n ist Slice 3b — keine Vorarbeiten dafür in diesem Slice.
- **`isDesktopOnly` bleibt `true`.**
- **Renderer-only-Code ist node-test-blind.** `file-picker.ts`, `tabs/import.ts` und die View-Verdrahtung bekommen keine Unit-Tests, sondern werden in Task 10 manuell verifiziert.
- Commit-Präfixe wie im Bestand: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.

---

### Task 1: Zustandsautomat des Imports

**Files:**
- Create: `src/core/import-state.ts`
- Test: `tests/core/import-state.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces:
  - `type ImportPhase = "unzipping" | "parsing" | "writing"`
  - `type ImportState` (diskriminierte Union über `status`, s.u.)
  - `const IDLE: ImportState`
  - `started(fileName: string): ImportState`
  - `progressed(prev: ImportState, records: number): ImportState`
  - `phaseChanged(prev: ImportState, phase: ImportPhase): ImportState`
  - `finished(records: number): ImportState`
  - `aborted(prev: ImportState): ImportState`
  - `failed(prev: ImportState, message: string): ImportState`

- [ ] **Step 1: Write the failing test**

Create `tests/core/import-state.test.ts`:

```ts
import {
  IDLE, started, progressed, phaseChanged, finished, aborted, failed,
} from "../../src/core/import-state";

describe("import-state", () => {
  it("startet im Leerlauf und geht mit dem Dateinamen in den Lauf", () => {
    expect(IDLE).toEqual({ status: "idle" });
    expect(started("Export.zip")).toEqual({
      status: "running", phase: "unzipping", records: 0, fileName: "Export.zip",
    });
  });

  it("zählt Records und wechselt Phasen, ohne den Dateinamen zu verlieren", () => {
    const s1 = progressed(started("Export.zip"), 250_000);
    expect(s1).toEqual({
      status: "running", phase: "unzipping", records: 250_000, fileName: "Export.zip",
    });
    const s2 = phaseChanged(s1, "parsing");
    expect(s2).toEqual({
      status: "running", phase: "parsing", records: 250_000, fileName: "Export.zip",
    });
  });

  it("ignoriert Fortschritt und Phasenwechsel, wenn nicht gelaufen wird", () => {
    expect(progressed(IDLE, 5)).toEqual(IDLE);
    expect(phaseChanged(IDLE, "parsing")).toEqual(IDLE);
  });

  it("schließt mit Erfolg, Abbruch oder Fehler ab", () => {
    expect(finished(5_719_032)).toEqual({ status: "done", records: 5_719_032 });
    expect(aborted(started("Export.zip"))).toEqual({ status: "aborted" });
    expect(failed(started("Export.zip"), "kaputt")).toEqual({ status: "failed", message: "kaputt" });
  });

  // Der Abbruch bricht den Stream ab, was in aller Regel noch einen Fehler nach sich zieht.
  // Dieser Fehler darf den Abbruch-Zustand nicht überschreiben — sonst sieht der Nutzer
  // "Import fehlgeschlagen", obwohl er selbst abgebrochen hat.
  it("lässt einen Fehler nach dem Abbruch den Abbruch nicht überschreiben", () => {
    const abortedState = aborted(started("Export.zip"));
    expect(failed(abortedState, "stream closed")).toEqual({ status: "aborted" });
  });

  it("bricht aus dem Leerlauf heraus nicht ab", () => {
    expect(aborted(IDLE)).toEqual(IDLE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/import-state.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/core/import-state"`

- [ ] **Step 3: Write minimal implementation**

Create `src/core/import-state.ts`:

```ts
/** Phasen eines Import-Laufs. `unzipping` entfällt bei einer direkt gewählten .xml. */
export type ImportPhase = "unzipping" | "parsing" | "writing";

export type ImportState =
  | { status: "idle" }
  | { status: "running"; phase: ImportPhase; records: number; fileName: string }
  | { status: "done"; records: number }
  | { status: "aborted" }
  | { status: "failed"; message: string };

export const IDLE: ImportState = { status: "idle" };

export function started(fileName: string): ImportState {
  return { status: "running", phase: "unzipping", records: 0, fileName };
}

export function progressed(prev: ImportState, records: number): ImportState {
  return prev.status === "running" ? { ...prev, records } : prev;
}

export function phaseChanged(prev: ImportState, phase: ImportPhase): ImportState {
  return prev.status === "running" ? { ...prev, phase } : prev;
}

export function finished(records: number): ImportState {
  return { status: "done", records };
}

export function aborted(prev: ImportState): ImportState {
  return prev.status === "running" ? { status: "aborted" } : prev;
}

/**
 * Ein Abbruch reißt den Stream ab und erzeugt dabei fast immer noch einen Folgefehler.
 * Der darf den Abbruch nicht überschreiben, sonst meldet die UI ein Scheitern, wo der
 * Nutzer selbst gestoppt hat.
 */
export function failed(prev: ImportState, message: string): ImportState {
  return prev.status === "aborted" ? prev : { status: "failed", message };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/import-state.test.ts`
Expected: PASS — 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/core/import-state.ts tests/core/import-state.test.ts
git commit -m "feat(core): import state machine with abort-wins-over-error rule"
```

---

### Task 2: `aggregateStream` abbrechbar und UI-freundlich machen

**Files:**
- Modify: `src/core/pipeline.ts`
- Test: `tests/core/pipeline-abort.test.ts`

**Interfaces:**
- Consumes: nichts aus Task 1
- Produces:
  - `class ImportAbortedError extends Error` (`name === "ImportAbortedError"`)
  - `interface AggregateOptions { onProgress?: (records: number) => void; signal?: AbortSignal; yieldToUi?: () => Promise<void>; yieldEveryMs?: number }`
  - `aggregateStream(chunks, meta, opts?: AggregateOptions): Promise<HealthCache>` — **dritter Parameter ist jetzt ein Options-Objekt statt eines `onProgress`-Callbacks**

**Wichtig:** Die Signaturänderung bricht bestehende Aufrufer. Schritt 1 findet sie.

- [ ] **Step 1: Bestehende Aufrufer finden**

Run: `grep -rn --include='*.ts' 'aggregateStream' src/ tests/`
Expected: Treffer in `src/core/pipeline.ts`, `src/main.ts:87`, `tests/core/pipeline.test.ts`.
Notiere jeden Aufruf mit drittem Argument — nur `src/main.ts:87` übergibt eines. `src/main.ts` wird in Task 7 umgebaut; bis dahin darf `npm run typecheck` dort einen Fehler zeigen.

- [ ] **Step 2: Write the failing test**

Create `tests/core/pipeline-abort.test.ts`:

```ts
import { aggregateStream, ImportAbortedError } from "../../src/core/pipeline";

const META = { sourceFile: "x.xml", importedAt: "2026-07-20T00:00:00.000Z" };

// Liefert endlos Chunks, damit der Abbruch die einzige Abbruchbedingung ist.
async function* endless(): AsyncIterable<string> {
  const record = '<Record type="HKQuantityTypeIdentifierStepCount" '
    + 'startDate="2026-07-01 08:00:00 +0200" value="100"/>';
  for (;;) {
    yield record;
    await Promise.resolve();
  }
}

describe("aggregateStream — Abbruch", () => {
  it("wirft ImportAbortedError, wenn das Signal vor dem Start gesetzt ist", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(aggregateStream(endless(), META, { signal: ctrl.signal }))
      .rejects.toBeInstanceOf(ImportAbortedError);
  });

  it("wirft ImportAbortedError, wenn mitten im Stream abgebrochen wird", async () => {
    const ctrl = new AbortController();
    let chunks = 0;
    async function* counted(): AsyncIterable<string> {
      for await (const c of endless()) {
        if (++chunks === 50) ctrl.abort();
        yield c;
      }
    }
    await expect(aggregateStream(counted(), META, { signal: ctrl.signal }))
      .rejects.toBeInstanceOf(ImportAbortedError);
    expect(chunks).toBeLessThan(200); // bricht zeitnah ab, läuft nicht weiter
  });

  it("ruft yieldToUi zeitgesteuert auf", async () => {
    let yields = 0;
    const ctrl = new AbortController();
    let chunks = 0;
    async function* counted(): AsyncIterable<string> {
      for await (const c of endless()) {
        if (++chunks === 100) ctrl.abort();
        yield c;
      }
    }
    await expect(aggregateStream(counted(), META, {
      signal: ctrl.signal,
      yieldToUi: () => { yields++; return Promise.resolve(); },
      yieldEveryMs: 0, // jede Runde yielden, damit der Test nicht auf Zeit warten muss
    })).rejects.toBeInstanceOf(ImportAbortedError);
    expect(yields).toBeGreaterThan(0);
  });

  it("läuft ohne Optionen unverändert durch", async () => {
    const xml = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
      + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';
    const cache = await aggregateStream([xml], META);
    expect(cache.recordCount).toBe(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/core/pipeline-abort.test.ts`
Expected: FAIL — `ImportAbortedError` ist kein Export von `pipeline`

- [ ] **Step 4: Write the implementation**

Replace the contents of `src/core/pipeline.ts` with:

```ts
import { XmlTokenizer, type StartTag } from "./xml-tokenizer";
import { eventFromTag } from "./health-parser";
import { Aggregator } from "./aggregator";
import type { HealthCache } from "./types";

export interface AggregateMeta { sourceFile: string; importedAt: string; }

/** Signalisiert den vom Nutzer ausgelösten Abbruch — kein Fehlerfall. */
export class ImportAbortedError extends Error {
  constructor() {
    super("Import aborted");
    this.name = "ImportAbortedError";
  }
}

export interface AggregateOptions {
  onProgress?: (records: number) => void;
  signal?: AbortSignal;
  /**
   * Wird periodisch awaited, damit der aufrufende Renderer zeichnen und Klicks
   * verarbeiten kann. Der Kern kennt keine Timer — der Aufrufer reicht sie herein.
   */
  yieldToUi?: () => Promise<void>;
  yieldEveryMs?: number;
}

const PROGRESS_EVERY = 250_000;

export async function aggregateStream(
  chunks: AsyncIterable<string> | Iterable<string>,
  meta: AggregateMeta,
  opts: AggregateOptions = {},
): Promise<HealthCache> {
  const { onProgress, signal, yieldToUi, yieldEveryMs = 250 } = opts;
  const tok = new XmlTokenizer();
  const agg = new Aggregator();
  let seen = 0;
  let lastYield = Date.now();

  const handle = (tag: StartTag): void => {
    const e = eventFromTag(tag);
    if (!e) return;
    agg.add(e);
    if (e.kind === "record") {
      seen++;
      if (onProgress && seen % PROGRESS_EVERY === 0) onProgress(seen);
    }
  };

  if (signal?.aborted) throw new ImportAbortedError();

  for await (const chunk of chunks as AsyncIterable<string>) {
    if (signal?.aborted) throw new ImportAbortedError();
    tok.feed(chunk, handle);

    if (yieldToUi && Date.now() - lastYield >= yieldEveryMs) {
      lastYield = Date.now();
      await yieldToUi();
      if (signal?.aborted) throw new ImportAbortedError();
    }
  }

  if (signal?.aborted) throw new ImportAbortedError();
  tok.end();
  return agg.finalize(meta);
}
```

- [ ] **Step 5: Run both pipeline test files**

Run: `npx vitest run tests/core/pipeline-abort.test.ts tests/core/pipeline.test.ts`
Expected: PASS in beiden Dateien. `pipeline.test.ts` ruft `aggregateStream` ohne drittes Argument auf und bleibt daher kompatibel.

- [ ] **Step 6: Commit**

```bash
git add src/core/pipeline.ts tests/core/pipeline-abort.test.ts
git commit -m "feat(core): abortable aggregateStream with cooperative UI yielding"
```

---

### Task 3: `health-source` auf `File` umstellen, `node:`-Importe entfernen

**Files:**
- Modify: `src/obsidian/health-source.ts` (vollständiger Ersatz)
- Test: `tests/obsidian/health-source.test.ts` (ersetzen, falls vorhanden — sonst neu)

**Interfaces:**
- Consumes: nichts
- Produces:
  - `isExportEntry(name: string): boolean` (unverändert im Verhalten, ohne `node:path`)
  - `openImportSource(file: File): AsyncIterable<string>` — **nimmt jetzt ein `File` statt eines Pfads**
  - `pickImportFile` **entfällt ersatzlos**

- [ ] **Step 1: Alte Aufrufer finden**

Run: `grep -rn --include='*.ts' 'pickImportFile\|openImportSource' src/ tests/`
Expected: Treffer in `src/main.ts` (Zeilen 6, 82, 88) und ggf. in bestehenden Tests. `src/main.ts` wird in Task 7 umgebaut. Entferne jetzt bereits alle Tests, die `pickImportFile` prüfen — die Funktion verschwindet.

- [ ] **Step 2: Write the failing test**

Create/replace `tests/obsidian/health-source.test.ts`:

```ts
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/health-source.test.ts`
Expected: FAIL — `openImportSource` erwartet noch einen `string`

- [ ] **Step 4: Write the implementation**

Replace the **entire contents** of `src/obsidian/health-source.ts` with:

```ts
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
      if (failure) throw failure;
      if (pending.length) { const out = pending; pending = []; yield* out; }
    }
    unzip.push(new Uint8Array(0), true);
    if (failure) throw failure;
    if (pending.length) yield* pending;
    if (!matched) throw new Error("Export.xml nicht im Zip gefunden");
  } finally {
    reader.releaseLock();
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/health-source.test.ts`
Expected: PASS — 5 passed

- [ ] **Step 6: Verify no node: imports remain in this file**

Run: `grep -n 'node:' src/obsidian/health-source.ts`
Expected: keine Ausgabe (Exit-Code 1)

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/health-source.ts tests/obsidian/health-source.test.ts
git commit -m "refactor(obsidian): read export via File.stream(), drop node:fs and node:path"
```

---

### Task 4: Datei-Dialog kapseln

**Files:**
- Create: `src/obsidian/file-picker.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `pickHealthExport(doc: Document): Promise<File | null>` — `null`, wenn der Nutzer abbricht

Kein Unit-Test: braucht ein echtes `document` und einen echten Dialog. Verifikation in Task 10.

- [ ] **Step 1: Implementierung schreiben**

Create `src/obsidian/file-picker.ts`:

```ts
/**
 * Öffnet den nativen Datei-Dialog und liefert die gewählte Datei.
 *
 * Bewusst über <input type="file"> statt Electrons dialog-API: das ist der
 * plattformneutrale Weg und kommt ohne node:-Module aus. Der absolute Pfad
 * (File.path) wird NICHT gelesen — die Datei wird ausschließlich über
 * file.stream() verarbeitet, damit das Plugin ohne Dateisystem-Zugriff auskommt.
 */
export function pickHealthExport(doc: Document): Promise<File | null> {
  return new Promise((resolve) => {
    const input = doc.createElement("input");
    input.type = "file";
    input.accept = ".zip,.xml";
    input.style.display = "none";
    doc.body.appendChild(input);

    const cleanup = (): void => { input.remove(); };

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    }, { once: true });

    // Wird gefeuert, wenn der Nutzer den Dialog ohne Auswahl schließt. Nicht in allen
    // Electron-Versionen zuverlässig — deshalb räumt auch "change" auf, und ein
    // hängengebliebenes Input schadet nicht (display:none, kein Listener mehr).
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    }, { once: true });

    input.click();
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler in `src/obsidian/file-picker.ts`. Fehler in `src/main.ts` sind an dieser Stelle erwartet (wird in Task 7 umgebaut).

- [ ] **Step 3: Commit**

```bash
git add src/obsidian/file-picker.ts
git commit -m "feat(obsidian): file picker for health export, without File.path"
```

---

### Task 5: Import-Controller

**Files:**
- Create: `src/obsidian/import-controller.ts`
- Test: `tests/obsidian/import-controller.test.ts`

**Interfaces:**
- Consumes:
  - aus Task 1: `ImportState`, `IDLE`, `started`, `progressed`, `phaseChanged`, `finished`, `aborted`, `failed`
  - aus Task 2: `aggregateStream`, `ImportAbortedError`, `AggregateOptions`
  - aus Task 3: `openImportSource`
- Produces:
  - `interface ImportControllerHost { writeCache(cache: HealthCache): Promise<void> }`
  - `class ImportController` mit `constructor(host: ImportControllerHost, onState: (s: ImportState) => void)`, `start(file: File): Promise<void>`, `abort(): void`, `get state(): ImportState`

Der Controller ist DOM-frei und damit voll unit-testbar.

- [ ] **Step 1: Write the failing test**

Create `tests/obsidian/import-controller.test.ts`:

```ts
import { ImportController, type ImportControllerHost } from "../../src/obsidian/import-controller";
import type { ImportState } from "../../src/core/import-state";
import type { HealthCache } from "../../src/core/types";

const XML = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
  + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';

function hostSpy(): ImportControllerHost & { written: HealthCache[] } {
  const written: HealthCache[] = [];
  return { written, writeCache: (c) => { written.push(c); return Promise.resolve(); } };
}

describe("ImportController", () => {
  it("läuft durch, schreibt den Cache und endet in done", async () => {
    const host = hostSpy();
    const states: ImportState[] = [];
    const ctrl = new ImportController(host, (s) => states.push(s));

    await ctrl.start(new File([XML], "Export.xml"));

    expect(ctrl.state).toEqual({ status: "done", records: 1 });
    expect(host.written).toHaveLength(1);
    expect(host.written[0].recordCount).toBe(1);
    expect(states.some((s) => s.status === "running")).toBe(true);
    expect(states.at(-1)).toEqual({ status: "done", records: 1 });
  });

  it("schreibt keinen Cache, wenn abgebrochen wurde", async () => {
    const host = hostSpy();
    const ctrl = new ImportController(host, () => {});
    // Sofort abbrechen: start() prüft das Signal, bevor der Stream läuft.
    const running = ctrl.start(new File([XML], "Export.xml"));
    ctrl.abort();
    await running;

    expect(ctrl.state).toEqual({ status: "aborted" });
    expect(host.written).toHaveLength(0);
  });

  it("meldet einen Lesefehler als failed", async () => {
    const host = hostSpy();
    const ctrl = new ImportController(host, () => {});
    // .zip ohne gültigen Zip-Inhalt → fflate scheitert
    await ctrl.start(new File(["kein zip"], "kaputt.zip"));

    expect(ctrl.state.status).toBe("failed");
  });

  it("meldet einen Schreibfehler als failed", async () => {
    const host: ImportControllerHost = {
      writeCache: () => Promise.reject(new Error("Platte voll")),
    };
    const ctrl = new ImportController(host, () => {});
    await ctrl.start(new File([XML], "Export.xml"));

    expect(ctrl.state).toEqual({ status: "failed", message: "Platte voll" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/obsidian/import-controller.test.ts`
Expected: FAIL — `Failed to resolve import "../../src/obsidian/import-controller"`

- [ ] **Step 3: Write the implementation**

Create `src/obsidian/import-controller.ts`:

```ts
import { aggregateStream, ImportAbortedError } from "../core/pipeline";
import {
  IDLE, started, progressed, phaseChanged, finished, aborted, failed,
  type ImportState,
} from "../core/import-state";
import type { HealthCache } from "../core/types";
import { openImportSource } from "./health-source";

export interface ImportControllerHost {
  writeCache(cache: HealthCache): Promise<void>;
}

/**
 * Kapselt einen Import-Lauf: Abbruch-Steuerung, Zustandsübergänge, Cache-Write.
 * Enthält bewusst kein DOM — die View abonniert nur `onState`.
 */
export class ImportController {
  private current: ImportState = IDLE;
  private controller: AbortController | null = null;

  constructor(
    private readonly host: ImportControllerHost,
    private readonly onState: (state: ImportState) => void,
  ) {}

  get state(): ImportState { return this.current; }

  abort(): void { this.controller?.abort(); }

  async start(file: File): Promise<void> {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.emit(started(file.name));

    // Bricht der Nutzer ab, muss die UI das sofort sehen — nicht erst, wenn der
    // Stream den nächsten Chunk erreicht.
    signal.addEventListener("abort", () => { this.emit(aborted(this.current)); }, { once: true });

    try {
      const cache = await aggregateStream(
        openImportSource(file),
        { sourceFile: file.name, importedAt: new Date().toISOString() },
        {
          signal,
          onProgress: (records) => {
            this.emit(phaseChanged(progressed(this.current, records), "parsing"));
          },
          // Gibt den Renderer periodisch frei, damit Fortschritt sichtbar bleibt
          // und der Abbrechen-Button überhaupt Klicks verarbeiten kann.
          yieldToUi: () => new Promise<void>((r) => { activeWindow.setTimeout(r, 0); }),
        },
      );

      if (signal.aborted) return;
      this.emit(phaseChanged(this.current, "writing"));
      await this.host.writeCache(cache);
      this.emit(finished(cache.recordCount));
    } catch (e) {
      if (e instanceof ImportAbortedError || signal.aborted) {
        this.emit(aborted(this.current));
        return;
      }
      this.emit(failed(this.current, e instanceof Error ? e.message : String(e)));
    } finally {
      this.controller = null;
    }
  }

  private emit(next: ImportState): void {
    this.current = next;
    this.onState(next);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/obsidian/import-controller.test.ts`
Expected: PASS — 4 passed

Falls `activeWindow` im Node-Test nicht definiert ist: Der obsidian-Mock unter `tests/__mocks__/obsidian.ts` deckt das nicht ab, weil `activeWindow` ein Obsidian-**Global** ist, kein Modul-Export. Ergänze in der vitest-Config (Dateiname per `ls vitest.config.*` ermitteln) unter `test` den Eintrag `setupFiles: ["./tests/setup.ts"]` und lege `tests/setup.ts` an:

```ts
// Obsidian stellt `activeWindow` global bereit; im Node-Test steht nur globalThis zur Verfügung.
(globalThis as unknown as { activeWindow: typeof globalThis }).activeWindow = globalThis;
```

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/import-controller.ts tests/obsidian/import-controller.test.ts
git add vitest.config.* tests/setup.ts 2>/dev/null || true
git commit -m "feat(obsidian): import controller with abort handling and cache write"
```

---

### Task 6: Import-Screen

**Files:**
- Create: `src/obsidian/tabs/import.ts`
- Modify: `styles.css` (Anhang)

**Interfaces:**
- Consumes: aus Task 1: `ImportState`, `ImportPhase`
- Produces:
  - `interface ImportActions { choose(): void; abort(): void }`
  - `renderImport(el: HTMLElement, state: ImportState, actions: ImportActions): void`

Kein Unit-Test (DOM). Verifikation in Task 10.

- [ ] **Step 1: Implementierung schreiben**

Create `src/obsidian/tabs/import.ts`:

```ts
import { ButtonComponent } from "obsidian";
import type { ImportPhase, ImportState } from "../../core/import-state";

export interface ImportActions {
  choose(): void;
  abort(): void;
}

const PHASE_LABEL: Record<ImportPhase, string> = {
  unzipping: "Export wird entpackt …",
  parsing: "Daten werden gelesen …",
  writing: "Ergebnis wird gespeichert …",
};

/** Rendert den Import-Screen für den gegebenen Zustand. Ersetzt den Inhalt von `el`. */
export function renderImport(el: HTMLElement, state: ImportState, actions: ImportActions): void {
  el.empty();
  const box = el.createDiv({ cls: "ah-empty ah-import" });

  if (state.status === "running") {
    box.createEl("h3", { text: "Import läuft" });
    box.createEl("p", { cls: "ah-import-file", text: state.fileName });
    box.createEl("p", { cls: "ah-import-phase", text: PHASE_LABEL[state.phase] });
    box.createEl("p", {
      cls: "ah-import-count",
      text: state.records > 0 ? `${state.records.toLocaleString("de-DE")} Datensätze` : "…",
    });
    new ButtonComponent(box).setButtonText("Abbrechen").onClick(() => { actions.abort(); });
    return;
  }

  if (state.status === "failed") {
    box.createEl("h3", { text: "Import fehlgeschlagen" });
    box.createEl("p", { cls: "ah-import-error", text: state.message });
    new ButtonComponent(box).setButtonText("Erneut versuchen").setCta()
      .onClick(() => { actions.choose(); });
    return;
  }

  if (state.status === "aborted") {
    box.createEl("h3", { text: "Import abgebrochen" });
    box.createEl("p", { text: "Es wurden keine Daten gespeichert." });
    new ButtonComponent(box).setButtonText("Export auswählen").setCta()
      .onClick(() => { actions.choose(); });
    return;
  }

  // idle / done-ohne-Cache
  box.createEl("h3", { text: "Noch keine Daten" });
  box.createEl("p", {
    text: "Exportiere deine Daten in der Health-App (Profil → Alle Gesundheitsdaten "
      + "exportieren) und wähle hier die entstandene Datei aus.",
  });
  new ButtonComponent(box).setButtonText("Export auswählen").setCta()
    .onClick(() => { actions.choose(); });
}
```

- [ ] **Step 2: Styles ergänzen**

Append to `styles.css`:

```css
/* --- Import-Screen ---------------------------------------------------- */
.ah-import .ah-import-file {
  font-family: var(--font-monospace);
  color: var(--text-muted);
}
.ah-import .ah-import-phase { color: var(--text-muted); }
.ah-import .ah-import-count {
  font-size: var(--font-ui-large);
  font-variant-numeric: tabular-nums;
}
.ah-import .ah-import-error {
  color: var(--text-error);
  max-width: 40em;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: keine Fehler in `src/obsidian/tabs/import.ts` (Fehler in `src/main.ts` weiterhin erwartet).

- [ ] **Step 4: Commit**

```bash
git add src/obsidian/tabs/import.ts styles.css
git commit -m "feat(obsidian): import screen with progress, abort and retry states"
```

---

### Task 7: Verdrahtung — View, Plugin, Cache über die Adapter-API

**Files:**
- Modify: `src/obsidian/dashboard-view.ts` (Imports + `DashboardHost`, neue Felder, `onOpen`/Empty-State)
- Modify: `src/main.ts` (vollständiger Ersatz)

**Hinweis zu den Fundstellen:** Der erste Schritt ersetzt den Dateikopf und verschiebt damit alle
folgenden Zeilennummern. Arbeite deshalb nach den genannten **Ankern** (Symbolnamen), nicht nach
Zeilennummern.

**Interfaces:**
- Consumes: alles aus Tasks 1–6
- Produces:
  - `DashboardHost` erweitert um `createImportController(onState): ImportController` und `pickExport(): Promise<File | null>`; `runImport()` entfällt
  - `main.ts` schreibt/liest den Cache über `app.vault.adapter` + `normalizePath` + `vault.configDir`

- [ ] **Step 1: `dashboard-view.ts` anpassen**

Replace everything from the first `import` line through the closing `];` of the `TABS` constant with:

```ts
import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type { HealthCache } from "../core/types";
import { IDLE, type ImportState } from "../core/import-state";
import type { ImportController } from "./import-controller";
import { renderImport } from "./tabs/import";
import { renderOverview } from "./tabs/overview";
import { renderDetail, type DetailState } from "./tabs/detail";
import { renderWorkouts } from "./tabs/workouts";

export const VIEW_TYPE_DASHBOARD = "apple-health-dashboard";

export interface DashboardHost {
  loadCache(): Promise<HealthCache | null>;
  getFavorites(): string[];
  toggleFavorite(id: string): Promise<void>;
  createImportController(onState: (s: ImportState) => void): ImportController;
  pickExport(): Promise<File | null>;
}

export type TabId = "overview" | "detail" | "workouts";
const TABS: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "overview", label: "Übersicht", icon: "layout-grid" },
  { id: "detail", label: "Detail", icon: "line-chart" },
  { id: "workouts", label: "Workouts", icon: "dumbbell" },
];
```

Add these fields directly after the existing `private overviewSeeded = false;` line:

```ts
  private importState: ImportState = IDLE;
  private importCtrl: ImportController | null = null;
```

Replace the entire `async onOpen()` method and the `private renderEmptyState()` method with:

```ts
  async onOpen(): Promise<void> {
    this.cache = await this.host.loadCache();
    this.renderRoot();
  }

  private renderRoot(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("ah-dashboard");
    this.panels.clear();
    this.tabButtons.clear();

    if (!this.cache) { this.renderImportScreen(root); return; }

    const head = root.createDiv({ cls: "ah-tabbar" });
    for (const t of TABS) {
      const btn = head.createDiv({ cls: "ah-tab" });
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-label", t.label);
      const icon = btn.createSpan({ cls: "ah-tab-icon" });
      setIcon(icon, t.icon);
      btn.createSpan({ cls: "ah-tab-label", text: t.label });
      btn.addEventListener("click", () => { this.switchTab(t.id); this.renderActive(); });
      this.tabButtons.set(t.id, btn);
    }

    const content = root.createDiv({ cls: "ah-content" });
    for (const t of TABS) {
      const panel = content.createDiv({ cls: "ah-panel" });
      this.panels.set(t.id, panel);
    }
    this.switchTab(this.active);
    this.renderActive();
  }

  private renderImportScreen(root: HTMLElement): void {
    const host = root.createDiv({ cls: "ah-import-host" });
    renderImport(host, this.importState, {
      choose: () => { void this.startImport(); },
      abort: () => { this.importCtrl?.abort(); },
    });
  }

  private async startImport(): Promise<void> {
    const file = await this.host.pickExport();
    if (!file) return; // Nutzer hat den Dialog geschlossen

    this.importCtrl = this.host.createImportController((state) => {
      this.importState = state;
      // Während des Laufs nur den Import-Screen neu zeichnen, nicht das ganze Root.
      const hostEl = this.contentEl.querySelector<HTMLElement>(".ah-import-host");
      if (hostEl) {
        renderImport(hostEl, state, {
          choose: () => { void this.startImport(); },
          abort: () => { this.importCtrl?.abort(); },
        });
      }
    });

    await this.importCtrl.start(file);

    if (this.importState.status === "done") {
      this.cache = await this.host.loadCache();
      this.active = "overview";
      this.renderRoot();
    }
  }
```

- [ ] **Step 2: `main.ts` ersetzen**

Replace the **entire contents** of `src/main.ts` with:

```ts
import { Notice, Plugin, WorkspaceLeaf, normalizePath } from "obsidian";
import type { HealthCache } from "./core/types";
import type { ImportState } from "./core/import-state";
import { ImportController } from "./obsidian/import-controller";
import { pickHealthExport } from "./obsidian/file-picker";
import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "./obsidian/dashboard-view";

const CACHE_FILE = "health-cache.json";

interface PluginData { favorites: string[]; }
const DEFAULT_DATA: PluginData = { favorites: [] };

export default class AppleHealthPlugin extends Plugin implements DashboardHost {
  private data: PluginData = { ...DEFAULT_DATA };

  async onload(): Promise<void> {
    await this.loadPluginData();

    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new DashboardView(leaf, this));

    this.addCommand({
      id: "open-dashboard",
      name: "Dashboard öffnen",
      callback: () => { void this.activateView(); },
    });
    this.addRibbonIcon("heart-pulse", "Apple Health Dashboard", () => { void this.activateView(); });
  }

  onunload(): void {}

  // --- Persistence ---
  async loadPluginData(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<PluginData> | null;
    this.data = { ...DEFAULT_DATA, ...(loaded ?? {}) };
  }

  /**
   * Pfad des Caches im eigenen Plugin-Ordner. Über vault.configDir statt eines
   * hartkodierten ".obsidian/..." — der Ordner ist konfigurierbar
   * (obsidianmd/hardcoded-config-path).
   */
  private cachePath(): string {
    return normalizePath(
      `${this.app.vault.configDir}/plugins/${this.manifest.id}/${CACHE_FILE}`,
    );
  }

  // --- DashboardHost ---
  getFavorites(): string[] { return this.data.favorites; }

  async toggleFavorite(id: string): Promise<void> {
    const i = this.data.favorites.indexOf(id);
    if (i >= 0) this.data.favorites.splice(i, 1);
    else this.data.favorites.push(id);
    await this.saveData(this.data);
  }

  async loadCache(): Promise<HealthCache | null> {
    try {
      const raw = await this.app.vault.adapter.read(this.cachePath());
      return JSON.parse(raw) as HealthCache;
    } catch {
      return null;
    }
  }

  async writeCache(cache: HealthCache): Promise<void> {
    await this.app.vault.adapter.write(this.cachePath(), JSON.stringify(cache));
  }

  createImportController(onState: (s: ImportState) => void): ImportController {
    return new ImportController(this, (state) => {
      onState(state);
      if (state.status === "failed") {
        new Notice(`Apple Health: Import fehlgeschlagen — ${state.message}`, 0);
      }
    });
  }

  pickExport(): Promise<File | null> {
    return pickHealthExport(activeDocument);
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_DASHBOARD)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_DASHBOARD, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
```

- [ ] **Step 3: Typecheck und Tests**

Run: `npm run typecheck && npm test`
Expected: keine Typfehler; alle Tests grün. Schlägt ein bestehender Test fehl, weil er `runImport` oder `pickImportFile` erwartet, passe ihn an die neuen Interfaces an — die Funktionen existieren nicht mehr.

- [ ] **Step 4: Verify no node: imports remain anywhere in src/**

Run: `grep -rn --include='*.ts' 'node:' src/`
Expected: keine Ausgabe (Exit-Code 1). Bei einem Treffer: entfernen, bevor weitergearbeitet wird — sonst ist Task 3 wirkungslos.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: erfolgreicher Build, `main.js` wird erzeugt.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/obsidian/dashboard-view.ts
git commit -m "feat(obsidian): wire picker-driven import into dashboard, cache via adapter API"
```

---

### Task 8: Store-Pflichtdateien

**Files:**
- Modify: `manifest.json`
- Modify: `package.json` (description synchron halten)
- Create: `LICENSE`
- Modify: `README.md`

**Interfaces:** keine (reine Metadaten und Dokumentation)

- [ ] **Step 1: `manifest.json` korrigieren**

Replace the contents of `manifest.json` with:

```json
{
  "id": "apple-health",
  "name": "Apple Health",
  "version": "0.1.0",
  "minAppVersion": "1.8.0",
  "description": "Import Apple Health exports and explore your health data in charts and tables.",
  "author": "Johannes Kaindl",
  "authorUrl": "https://jkaindl.de",
  "isDesktopOnly": true
}
```

Änderungen: `description` endet mit einem Punkt, beginnt mit einem Aktionsverb und bleibt unter 250 Zeichen; `fundingUrl` ist **entfernt** (nicht geleert) — laut Submission requirements ist ein leerer String nicht vorgesehen.

- [ ] **Step 2: `package.json` description angleichen**

Set the `description` field in `package.json` to the same text:

```json
  "description": "Import Apple Health exports and explore your health data in charts and tables.",
```

- [ ] **Step 3: `LICENSE` anlegen**

Run:

```bash
curl -sL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
```

Expected: Datei `LICENSE` mit ~660 Zeilen, beginnend mit "GNU AFFERO GENERAL PUBLIC LICENSE".

Verify: `head -3 LICENSE && wc -l LICENSE`

Anschließend das Copyright im Kopf von `README.md` verankern (der Bot prüft mit `validate-license` auch die Copyright-Angabe) — siehe Step 4.

- [ ] **Step 4: README um Disclosure und neuen Import-Ablauf ergänzen**

Replace the `## Import` section in `README.md` (lines 17–31) with:

```markdown
## Import

1. In der **Health-App** (iPhone): Profil → *Alle Gesundheitsdaten exportieren*
   → die entstehende `Export.zip` auf den Rechner bringen.
2. In Obsidian: Ribbon-Icon **Apple Health Dashboard** (oder Command-Palette →
   **„Apple Health: Dashboard öffnen"**).
3. Im Dashboard **„Export auswählen"** klicken und die `Export.zip` (oder eine
   entpackte `Export.xml`) im Dateidialog wählen.

Der Lauf dauert bei großen Exports einige Minuten. Fortschritt, Phase und ein
Abbrechen-Button stehen währenddessen im Dashboard; danach öffnet sich die
Übersicht automatisch.

Ergebnis ist `health-cache.json` im Plugin-Verzeichnis: Tages-Aggregate je
Metrik plus eine Workout-Liste.

### Zugriff außerhalb des Vaults

Dieses Plugin liest **eine Datei außerhalb deines Vaults**: den Health-Export,
den du im Dateidialog auswählst. Das ist nötig, weil ein Apple-Health-Export
mehrere Gigabyte groß ist und nicht sinnvoll in einen Vault gehört. Es wird
ausschließlich die von dir gewählte Datei gelesen — nichts wird geschrieben,
verschoben oder irgendwohin gesendet. Die ausgewerteten Daten bleiben als
`health-cache.json` im Plugin-Verzeichnis auf deinem Rechner.
```

Also update the `## Lizenz` section at the end of `README.md`:

```markdown
## Lizenz

Copyright © 2026 Johannes Kaindl

Lizenziert unter der [GNU AGPL v3.0 oder später](LICENSE).
```

- [ ] **Step 5: Verify**

Run: `ls -la LICENSE && grep -n "fundingUrl" manifest.json; grep -c "Vaults" README.md`
Expected: `LICENSE` existiert; `grep fundingUrl` liefert **keine** Ausgabe (Exit-Code 1); README enthält den Disclosure-Abschnitt.

- [ ] **Step 6: Commit**

```bash
git add manifest.json package.json LICENSE README.md
git commit -m "docs: store submission requirements (license, manifest, out-of-vault disclosure)"
```

---

### Task 9: Lint-Gate auf Repo-Wurzel ausweiten

**Files:**
- Modify: `eslint.config.mjs`
- Modify: `package.json` (Scripts `lint`, `lint:obsidian`)

**Interfaces:** keine

Bisher läuft `eslint src` — `manifest.json` liegt im Root und wird von den Regeln `validate-manifest` und `validate-license` daher **nie geprüft**. Genau diese Lücke hat den Blocker bei local-image-generator erst beim Store-Bot sichtbar werden lassen.

- [ ] **Step 1: Config auf das Repo-Root ausweiten**

Replace the contents of `eslint.config.mjs` with:

```js
// Obsidian-Guideline-Gate (PROF-OBS-08): type-checked gegen ECHTE obsidian-Typen.
// KEIN Inline-`// eslint-disable` — genuin unvermeidbare Ausnahmen NUR als file-scoped
// Override unten, mit Begruendung (Review verbietet Inline-disables).
//
// Der Lauf umfasst bewusst das Repo-ROOT, nicht nur src/: die Regeln validate-manifest
// und validate-license greifen auf manifest.json bzw. LICENSE — beide liegen im Root.
// Ein auf src/ beschraenktes Gate sieht Store-Blocker in diesen Dateien nie.
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  { ignores: ["main.js", "node_modules/", "tests/__mocks__/", "docs/"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // --- file-scoped Overrides (Beispiel, auskommentiert) ---------------------
  // {
  //   files: ["src/streaming.ts"],
  //   rules: { "obsidianmd/no-restricted-globals": "off" }, // SSE via activeWindow.fetch, requestUrl kann nicht streamen
  // },
);
```

- [ ] **Step 2: Scripts anpassen**

In `package.json`, change:

```json
    "lint": "eslint .",
    "lint:obsidian": "eslint .",
```

- [ ] **Step 3: Vollen Lint-Lauf ausführen und auswerten**

Run: `npm run lint`

Erwartung und Vorgehen:
- **Errors → müssen behoben werden.** Error-Level-Regeln des Bots sind `no-sample-code`, `detach-leaves`, `no-plugin-as-component`, `no-static-styles-assignment`, `no-forbidden-elements`.
- **Diese Warnungen müssen verschwunden sein** (sie waren der Zweck von Task 3 und 7): `no-nodejs-modules`, `hardcoded-config-path`.
- **`ui/sentence-case`-Warnungen an deutschen Texten bleiben bestehen.** Das ist erwartet und wird **nicht** unterdrückt — i18n in Slice 3b löst sie an der Wurzel. Notiere die Anzahl für den Vergleich (Ausgangswert vor diesem Slice: 8). Die Config-Variante `recommendedWithLocalesEn` wäre die passende Antwort darauf, setzt aber ein Locale-Modul voraus — sie gehört deshalb in Slice 3b, nicht hierher.
- **Sonderfall `no-forbidden-elements` und `<input type="file">`:** Ob diese Regel den Datei-Dialog aus Task 4 erfasst, war in der Recherche nicht belegbar. Dieser Lauf beantwortet es. Meldet sie `src/obsidian/file-picker.ts`, **nicht per Override abschalten** — stattdessen melden und den Ansatz neu bewerten; die Regel ist Error-Level und damit ein echter Blocker.

- [ ] **Step 4: Ergebnis festhalten**

Run: `npm run lint 2>&1 | tail -5`
Notiere die Zahl verbleibender Probleme in der Commit-Message.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs package.json
git commit -m "chore: extend lint gate to repo root so manifest and license are checked"
```

---

### Task 10: Smoke-Test im ProtoVault (manuell, durch Jay)

**Files:** keine

Renderer-Verhalten ist in Node-Tests unsichtbar — zweimal in diesem Projekt bestätigt (fflate-Worker `beab394`, Kategorie-Kollaps `a4289dd`). Dieser Task ist Teil der Definition of Done, nicht optional.

**Deploy-Ziel:** `/Users/Shared/10_ObsidianVaults/00_ProtoVault/.obsidian/plugins/apple-health`
(ProtoVault ist **kein** git-Repo.)

- [ ] **Step 1: Bauen und deployen**

```bash
OBSIDIAN_PLUGIN_DIR="/Users/Shared/10_ObsidianVaults/00_ProtoVault/.obsidian/plugins/apple-health" npm run deploy
```

- [ ] **Step 2: Alten Zustand entfernen, damit der Erst-Start-Pfad geprüft wird**

```bash
rm -f "/Users/Shared/10_ObsidianVaults/00_ProtoVault/.obsidian/plugins/apple-health/health-cache.json"
rm -rf "/Users/Shared/10_ObsidianVaults/00_ProtoVault/.obsidian/plugins/apple-health/import"
```

- [ ] **Step 3: Prüfliste im laufenden Obsidian abarbeiten**

Obsidian neu laden (Cmd+R), dann:

- [ ] Dashboard über das Ribbon-Icon öffnen → **Import-Screen** erscheint (nicht der alte Empty-State)
- [ ] „Export auswählen" öffnet den **nativen Dateidialog**
- [ ] Dialog ohne Auswahl schließen → App bleibt bedienbar, Screen unverändert
- [ ] Echte 2,6-GB-`Export.zip` wählen → Phase und **Zähler laufen sichtbar hoch**
- [ ] **Während des Laufs:** Obsidian bleibt bedienbar (anderes Tab anklicken funktioniert)
- [ ] **Abbrechen klicken → der Lauf stoppt tatsächlich**, Screen zeigt „Import abgebrochen"
- [ ] Nach Abbruch: **keine** `health-cache.json` im Plugin-Ordner
- [ ] Erneut importieren, vollständig durchlaufen lassen → Übersicht öffnet sich automatisch
- [ ] Record-Zahl plausibel (Referenz Slice 1: 5.719.032 Records, 58 Metriken, 768 Workouts)
- [ ] Detail-Tab und Workouts-Tab funktionieren wie zuvor
- [ ] Obsidian neu laden → Dashboard lädt den Cache, Favoriten sind erhalten
- [ ] Eine `.xml` (statt `.zip`) auswählen → funktioniert ebenfalls

- [ ] **Step 4: Ruckelt die UI?**

Blieb der Zähler stehen oder reagierte „Abbrechen" nicht, greift **Plan B aus der Spec**: Rückfall auf eine einzelne ersetzende Notice (`setMessage`). Das ist als **Rückschritt** zu dokumentieren, nicht stillschweigend hinzunehmen. Vorher prüfen, ob ein kleineres `yieldEveryMs` (z.B. 100) das Problem löst.

- [ ] **Step 5: Befunde festhalten**

Jeder Fehlbefund wird als eigener Fix-Commit behoben, nicht gesammelt. Anschließend Smoke-Test wiederholen.

---

## Definition of Done

- [ ] `npm test` grün
- [ ] `npm run typecheck` ohne Fehler
- [ ] `npm run lint` ohne **Errors**; `no-nodejs-modules` und `hardcoded-config-path` verschwunden
- [ ] `grep -rn --include='*.ts' 'node:' src/` liefert keine Treffer
- [ ] `npm run build` erfolgreich
- [ ] Smoke-Test (Task 10) vollständig bestanden
- [ ] `LICENSE` vorhanden, `fundingUrl` aus `manifest.json` entfernt, README-Disclosure vorhanden
