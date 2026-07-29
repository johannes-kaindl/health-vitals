# Streaming-Parser + Tages-Aggregation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen Apple-Health-XML-Export (`.zip`/`.xml`, bis 2,6 GB) streamend parsen und zu Tages-Buckets pro Metrik aggregieren, gespeichert als lazy geladener `health-cache.json`.

**Architecture:** Dep-freier, chunk-robuster Streaming-XML-Tokenizer im pure Core (`src/core/`), gefolgt von Attribut→Event-Mapping, einem Aggregator mit drei Policies (`sum`/`measure`/`duration`) und einer Pipeline-Funktion. Die obsidian-Schicht (`src/obsidian/`, `src/main.ts`) liefert die Bytes (via `fflate`-Streaming-Unzip bzw. `fs`-Stream) und verdrahtet ein Import-Command.

**Tech Stack:** TypeScript (strict, ESM, ES2022), vitest (globals, node-env), `fflate` (streaming Unzip), Obsidian Plugin API.

## Global Constraints

- **Pure Core:** kein `import ... "obsidian"` in `src/core/` (PROF-OBS-03/04). Node-testbar.
- **TS strict/ESM:** `target ES2022`, `module ESNext`, `moduleResolution Bundler`, `strict: true`. Datei-Imports ohne `.ts`-Endung.
- **Tests:** vitest mit `globals: true` (kein Import von `describe/it/expect` nötig). Lauf: `npm test`. obsidian-Alias zeigt auf `tests/__mocks__/obsidian.ts` (nur für Dateien, die `obsidian` importieren).
- **Plugin-ID:** `apple-health`. **CSS-Prefix:** `ah-` (hier nicht relevant, kein UI).
- **`isDesktopOnly: true`** im Manifest.
- **Personenbezogen — NIE committen:** `import/`, `data.json`, **`health-cache.json`** (`.gitignore`).
- **Dependency:** `fflate` (Runtime, wird gebündelt → `dependencies`, nicht `devDependencies`).
- **Commits:** nach jedem Task; Message-Format des Repos (`feat:`/`test:`/`chore:` …), Footer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `apple-date` — lokaler Tag + Intervall-Minuten

**Files:**
- Create: `src/core/apple-date.ts`
- Test: `tests/core/apple-date.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `localDay(s: string): string`, `toEpochMs(s: string): number`, `durationMinutes(start: string, end: string): number`.

Hinweis: Apple-Health-Zeitstempel (`"2022-11-25 08:39:02 +0200"`) tragen die **Wanduhrzeit** vor dem Offset — der lokale Tag sind schlicht die ersten 10 Zeichen. Für `duration` brauchen wir echte Epoch-Differenz (Offset einrechnen).

- [ ] **Step 1: Failing test**

```ts
// tests/core/apple-date.test.ts
import { localDay, durationMinutes, toEpochMs } from "../../src/core/apple-date";

describe("apple-date", () => {
  it("localDay nimmt die Wanduhr-Datumsteil (kein TZ-Rechnen)", () => {
    expect(localDay("2022-11-25 08:39:02 +0200")).toBe("2022-11-25");
    expect(localDay("2022-11-25 23:30:00 +0200")).toBe("2022-11-25"); // Tagesgrenze bleibt lokal
  });

  it("toEpochMs rechnet den Offset ein", () => {
    // 08:00 +0200 == 06:00 UTC
    expect(toEpochMs("2022-11-25 08:00:00 +0200")).toBe(Date.UTC(2022, 10, 25, 6, 0, 0));
  });

  it("durationMinutes über eine Stunde inkl. Tagesübergang", () => {
    expect(durationMinutes("2022-11-25 23:30:00 +0200", "2022-11-26 00:30:00 +0200")).toBe(60);
  });

  it("durationMinutes ist 0 bei unparsbaren Werten", () => {
    expect(durationMinutes("kaputt", "2022-11-26 00:30:00 +0200")).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- apple-date`
Expected: FAIL („Cannot find module …/apple-date").

- [ ] **Step 3: Implement**

```ts
// src/core/apple-date.ts
// Apple-Health-Zeitstempel: "YYYY-MM-DD HH:MM:SS ±HHMM" (Wanduhrzeit + Offset).

const TS_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;

/** Lokaler Kalendertag "YYYY-MM-DD" — die Wanduhrzeit ist bereits lokal. */
export function localDay(s: string): string {
  return s.slice(0, 10);
}

/** Epoch-Millisekunden (Offset eingerechnet); NaN bei unparsbarem Input. */
export function toEpochMs(s: string): number {
  const m = TS_RE.exec(s.trim());
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S, sign, oh, om] = m;
  const utc = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
  const offsetMs = (sign === "+" ? 1 : -1) * (+oh * 60 + +om) * 60000;
  return utc - offsetMs;
}

/** Minuten zwischen zwei Zeitstempeln; 0 wenn einer unparsbar ist. */
export function durationMinutes(start: string, end: string): number {
  const a = toEpochMs(start);
  const b = toEpochMs(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return (b - a) / 60000;
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- apple-date`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/apple-date.ts tests/core/apple-date.test.ts
git commit -m "feat(core): apple-date localDay/durationMinutes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `xml-tokenizer` — dep-freier Streaming-Tokenizer

**Files:**
- Create: `src/core/xml-tokenizer.ts`
- Test: `tests/core/xml-tokenizer.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  - `interface StartTag { name: string; attrs: Record<string, string>; selfClosing: boolean }`
  - `class XmlTokenizer { feed(chunk: string, emit: (t: StartTag) => void): void; end(): void }`
  - `function decodeEntities(s: string): string`

Verhalten: emittiert **jedes** Start-Tag (self-closing wie Container), verwirft Close-Tags/Text/Kommentare/`<?…?>`/`<!DOCTYPE …[…]…>`. Puffert unvollständige Konstrukte über Chunk-Grenzen. Attribut-Scan ist quote-aware; Werte werden entity-dekodiert.

- [ ] **Step 1: Failing test**

```ts
// tests/core/xml-tokenizer.test.ts
import { XmlTokenizer, decodeEntities, type StartTag } from "../../src/core/xml-tokenizer";

function collect(input: string, chunkSize = input.length): StartTag[] {
  const tok = new XmlTokenizer();
  const out: StartTag[] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    tok.feed(input.slice(i, i + chunkSize), (t) => out.push(t));
  }
  tok.end();
  return out;
}

const DOC = `<?xml version="1.0"?>
<!DOCTYPE HealthData [ <!ELEMENT HealthData (Record)*> ]>
<HealthData locale="de_DE">
 <Record type="A" unit="count" value="1"/>
 <Record type="B" device="&lt;&lt;HKDevice&gt;" value="2">
  <MetadataEntry key="k" value="v"/>
 </Record>
</HealthData>`;

describe("xml-tokenizer", () => {
  it("decodeEntities löst die 5 XML-Entities", () => {
    expect(decodeEntities("&lt;a&gt;&amp;&quot;&apos;")).toBe(`<a>&"'`);
  });

  it("emittiert Start-Tags, überspringt Decl/DOCTYPE/Close/Text", () => {
    const tags = collect(DOC).map((t) => t.name);
    expect(tags).toEqual(["HealthData", "Record", "Record", "MetadataEntry"]);
  });

  it("erkennt self-closing vs Container und dekodiert Attribute", () => {
    const tags = collect(DOC);
    const a = tags.find((t) => t.attrs.type === "A")!;
    const b = tags.find((t) => t.attrs.type === "B")!;
    expect(a.selfClosing).toBe(true);
    expect(b.selfClosing).toBe(false);
    expect(b.attrs.device).toBe("<<HKDevice>");
  });

  it("ist chunk-grenzen-robust (jede Split-Größe → identische Tokens)", () => {
    const whole = JSON.stringify(collect(DOC));
    for (const size of [1, 2, 3, 7, 13, 50]) {
      expect(JSON.stringify(collect(DOC, size))).toBe(whole);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- xml-tokenizer`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement**

```ts
// src/core/xml-tokenizer.ts
export interface StartTag {
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ENTITIES[e]);
}

const NAME_RE = /^\s*([\w:.-]+)/;
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttrs(inner: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(inner)) !== null) {
    const val = m[2] !== undefined ? m[2] : (m[3] ?? "");
    attrs[m[1]] = decodeEntities(val);
  }
  return attrs;
}

// '>' innerhalb von Anführungszeichen ignorieren.
function findTagEnd(buf: string, lt: number): number {
  let quote: string | null = null;
  for (let j = lt + 1; j < buf.length; j++) {
    const ch = buf[j];
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return j;
  }
  return -1;
}

// <!DOCTYPE …> darf ein internes Subset "[ … ]" mit eigenen '>' enthalten.
function findDeclEnd(buf: string, lt: number): number {
  let depth = 0;
  for (let j = lt + 2; j < buf.length; j++) {
    const ch = buf[j];
    if (ch === "[") depth++;
    else if (ch === "]") { if (depth > 0) depth--; }
    else if (ch === ">" && depth === 0) return j;
  }
  return -1;
}

function emitStartTag(inner: string, emit: (t: StartTag) => void): void {
  let selfClosing = false;
  let s = inner;
  if (s.endsWith("/")) { selfClosing = true; s = s.slice(0, -1); }
  const nm = NAME_RE.exec(s);
  if (!nm) return;
  emit({ name: nm[1], attrs: parseAttrs(s.slice(nm[0].length)), selfClosing });
}

export class XmlTokenizer {
  private buf = "";

  feed(chunk: string, emit: (t: StartTag) => void): void {
    this.buf += chunk;
    const buf = this.buf;
    const n = buf.length;
    let i = 0;
    while (i < n) {
      const lt = buf.indexOf("<", i);
      if (lt === -1) { i = n; break; }           // Rest ist Text
      const c = buf[lt + 1];
      if (c === undefined) { i = lt; break; }     // '<' am Ende → warten
      if (c === "/") {                            // Close-Tag
        const gt = buf.indexOf(">", lt);
        if (gt === -1) { i = lt; break; }
        i = gt + 1; continue;
      }
      if (c === "?") {                            // <?xml …?>
        const end = buf.indexOf("?>", lt);
        if (end === -1) { i = lt; break; }
        i = end + 2; continue;
      }
      if (c === "!") {                            // Kommentar oder DOCTYPE
        if (buf.startsWith("<!--", lt)) {
          const end = buf.indexOf("-->", lt);
          if (end === -1) { i = lt; break; }
          i = end + 3; continue;
        }
        const end = findDeclEnd(buf, lt);
        if (end === -1) { i = lt; break; }
        i = end + 1; continue;
      }
      const end = findTagEnd(buf, lt);            // Start-Tag
      if (end === -1) { i = lt; break; }          // unvollständig → warten
      emitStartTag(buf.slice(lt + 1, end), emit);
      i = end + 1;
    }
    this.buf = buf.slice(i);
  }

  end(): void { this.buf = ""; }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- xml-tokenizer`
Expected: PASS (4 Tests, inkl. Chunk-Boundary über 6 Split-Größen).

- [ ] **Step 5: Commit**

```bash
git add src/core/xml-tokenizer.ts tests/core/xml-tokenizer.test.ts
git commit -m "feat(core): streaming XML tokenizer (chunk-robust, entity/quote-aware)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `aggregation-policy` — Policy pro Record-Typ

**Files:**
- Create: `src/core/aggregation-policy.ts`
- Test: `tests/core/aggregation-policy.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `type Policy = "sum" | "measure" | "duration"`, `function policyFor(type: string): Policy`.

- [ ] **Step 1: Failing test**

```ts
// tests/core/aggregation-policy.test.ts
import { policyFor } from "../../src/core/aggregation-policy";

describe("aggregation-policy", () => {
  it("kumulative Quantity-Typen → sum", () => {
    expect(policyFor("HKQuantityTypeIdentifierStepCount")).toBe("sum");
    expect(policyFor("HKQuantityTypeIdentifierActiveEnergyBurned")).toBe("sum");
  });
  it("unbekannter Quantity-Typ → measure (Default)", () => {
    expect(policyFor("HKQuantityTypeIdentifierHeartRate")).toBe("measure");
    expect(policyFor("HKQuantityTypeIdentifierWasWeissIch")).toBe("measure");
  });
  it("Kategorie-Typen → duration (Default)", () => {
    expect(policyFor("HKCategoryTypeIdentifierSleepAnalysis")).toBe("duration");
    expect(policyFor("HKCategoryTypeIdentifierIrgendwas")).toBe("duration");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- aggregation-policy`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement**

```ts
// src/core/aggregation-policy.ts
export type Policy = "sum" | "measure" | "duration";

// Kumulative Mengen → Tages-Summe. Alles andere Quantity → measure (min/max/avg).
const SUM_TYPES = new Set<string>([
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierDistanceCycling",
  "HKQuantityTypeIdentifierDistanceSwimming",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierBasalEnergyBurned",
  "HKQuantityTypeIdentifierFlightsClimbed",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierAppleStandTime",
  "HKQuantityTypeIdentifierSwimmingStrokeCount",
  "HKQuantityTypeIdentifierTimeInDaylight",
  "HKQuantityTypeIdentifierDietaryWater",
]);

export function policyFor(type: string): Policy {
  if (SUM_TYPES.has(type)) return "sum";
  if (type.startsWith("HKCategoryTypeIdentifier")) return "duration";
  return "measure";
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- aggregation-policy`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/aggregation-policy.ts tests/core/aggregation-policy.test.ts
git commit -m "feat(core): aggregation policy (sum/measure/duration) per record type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `types` + `health-parser` — Tag→Event-Mapping

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/health-parser.ts`
- Test: `tests/core/health-parser.test.ts`

**Interfaces:**
- Consumes: `StartTag` (Task 2).
- Produces (`types.ts`):
  - `Policy` (re-export aus `aggregation-policy`), `SumBucket`, `MeasureBucket`, `DurationBucket`, `DayBucket`, `MetricSeries`, `WorkoutEntry`, `HealthCache` (exakte Shapes unten).
- Produces (`health-parser.ts`):
  - `interface RecordEvent { kind: "record"; type: string; unit: string; startDate: string; endDate: string; value: number | null }`
  - `interface WorkoutEvent { kind: "workout"; activityType: string; startDate: string; endDate: string; duration: number }`
  - `type HealthEvent = RecordEvent | WorkoutEvent`
  - `function eventFromTag(tag: StartTag): HealthEvent | null`

- [ ] **Step 1: `types.ts` schreiben (kein eigener Test — via Aggregator/Pipeline getestet)**

```ts
// src/core/types.ts
import type { Policy } from "./aggregation-policy";
export type { Policy };

export interface SumBucket { sum: number; count: number; }
export interface MeasureBucket { min: number; max: number; avg: number; count: number; }
export interface DurationBucket { minutes: number; count: number; }
export type DayBucket = SumBucket | MeasureBucket | DurationBucket;

export interface MetricSeries {
  unit: string;
  policy: Policy;
  daily: Record<string, DayBucket>; // Key: "YYYY-MM-DD"
}

export interface WorkoutEntry {
  type: string;        // workoutActivityType
  start: string;       // "YYYY-MM-DDTHH:MM"
  durationMin: number;
}

export interface HealthCache {
  version: 1;
  sourceFile: string;
  importedAt: string;
  recordCount: number;
  skippedCount: number;
  dateRange: { from: string; to: string } | null;
  metrics: Record<string, MetricSeries>;
  workouts: WorkoutEntry[];
}
```

- [ ] **Step 2: Failing test für `health-parser`**

```ts
// tests/core/health-parser.test.ts
import { eventFromTag, type RecordEvent, type WorkoutEvent } from "../../src/core/health-parser";
import type { StartTag } from "../../src/core/xml-tokenizer";

function tag(name: string, attrs: Record<string, string>): StartTag {
  return { name, attrs, selfClosing: true };
}

describe("health-parser", () => {
  it("mappt Record inkl. numerischem value", () => {
    const e = eventFromTag(tag("Record", {
      type: "HKQuantityTypeIdentifierStepCount", unit: "count",
      startDate: "2022-11-25 08:39:02 +0200", endDate: "2022-11-25 08:47:00 +0200", value: "214",
    })) as RecordEvent;
    expect(e.kind).toBe("record");
    expect(e.value).toBe(214);
    expect(e.type).toBe("HKQuantityTypeIdentifierStepCount");
  });

  it("value=null bei fehlendem oder nicht-numerischem value", () => {
    const missing = eventFromTag(tag("Record", { type: "T", startDate: "2022-11-25 08:00:00 +0200" })) as RecordEvent;
    expect(missing.value).toBeNull();
    const cat = eventFromTag(tag("Record", {
      type: "HKCategoryTypeIdentifierSleepAnalysis", value: "HKCategoryValueSleepAnalysisAsleepCore",
      startDate: "2022-11-25 08:00:00 +0200",
    })) as RecordEvent;
    expect(cat.value).toBeNull();
  });

  it("skippt Record ohne type oder startDate", () => {
    expect(eventFromTag(tag("Record", { type: "T" }))).toBeNull();
    expect(eventFromTag(tag("Record", { startDate: "2022-11-25 08:00:00 +0200" }))).toBeNull();
  });

  it("mappt Workout", () => {
    const w = eventFromTag(tag("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeTraditionalStrengthTraining",
      duration: "30.5", startDate: "2022-11-25 18:00:00 +0200", endDate: "2022-11-25 18:30:30 +0200",
    })) as WorkoutEvent;
    expect(w.kind).toBe("workout");
    expect(w.duration).toBe(30.5);
  });

  it("ignoriert fremde Tags", () => {
    expect(eventFromTag(tag("MetadataEntry", { key: "k", value: "v" }))).toBeNull();
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test -- health-parser`
Expected: FAIL (Modul fehlt).

- [ ] **Step 4: Implement `health-parser.ts`**

```ts
// src/core/health-parser.ts
import type { StartTag } from "./xml-tokenizer";

export interface RecordEvent {
  kind: "record";
  type: string;
  unit: string;
  startDate: string;
  endDate: string;
  value: number | null;
}

export interface WorkoutEvent {
  kind: "workout";
  activityType: string;
  startDate: string;
  endDate: string;
  duration: number;
}

export type HealthEvent = RecordEvent | WorkoutEvent;

export function eventFromTag(tag: StartTag): HealthEvent | null {
  const a = tag.attrs;
  if (tag.name === "Record") {
    if (!a.type || !a.startDate) return null;
    const num = a.value !== undefined ? Number(a.value) : NaN;
    return {
      kind: "record",
      type: a.type,
      unit: a.unit ?? "",
      startDate: a.startDate,
      endDate: a.endDate ?? a.startDate,
      value: Number.isFinite(num) ? num : null,
    };
  }
  if (tag.name === "Workout") {
    if (!a.workoutActivityType || !a.startDate) return null;
    const dur = Number(a.duration);
    return {
      kind: "workout",
      activityType: a.workoutActivityType,
      startDate: a.startDate,
      endDate: a.endDate ?? a.startDate,
      duration: Number.isFinite(dur) ? dur : 0,
    };
  }
  return null;
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npm test -- health-parser`
Expected: PASS (5 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/health-parser.ts tests/core/health-parser.test.ts
git commit -m "feat(core): health cache types + tag-to-event parser

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `aggregator` — Tages-Buckets akkumulieren

**Files:**
- Create: `src/core/aggregator.ts`
- Test: `tests/core/aggregator.test.ts`

**Interfaces:**
- Consumes: `HealthEvent` (Task 4), `policyFor` (Task 3), `localDay`/`durationMinutes` (Task 1), `HealthCache`/`MetricSeries`/`WorkoutEntry`/`DayBucket` (Task 4).
- Produces: `class Aggregator { add(e: HealthEvent): void; finalize(meta: { sourceFile: string; importedAt: string }): HealthCache }`.

Regeln: `sum`/`measure`-Records mit `value === null` → `skippedCount++`, kein `recordCount`, kein Tag berührt. `duration`-Records nutzen Intervall-Minuten (auch wenn `value` null). `unit` = erste nicht-leere Beobachtung pro Typ. `avg` wird in `finalize()` aus laufender Summe/Count berechnet. Zahlen auf 2 Nachkommastellen gerundet.

- [ ] **Step 1: Failing test**

```ts
// tests/core/aggregator.test.ts
import { Aggregator } from "../../src/core/aggregator";
import type { HealthEvent } from "../../src/core/health-parser";
import type { SumBucket, MeasureBucket, DurationBucket } from "../../src/core/types";

const META = { sourceFile: "x.zip", importedAt: "2026-07-19T00:00:00.000Z" };

function rec(type: string, value: number | null, start: string, end = start, unit = "u"): HealthEvent {
  return { kind: "record", type, unit, startDate: start, endDate: end, value };
}

describe("Aggregator", () => {
  it("sum: addiert value pro Tag, zählt count", () => {
    const agg = new Aggregator();
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 214, "2022-11-25 08:39:02 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 86, "2022-11-25 09:10:00 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 500, "2022-11-26 07:00:00 +0200"));
    const cache = agg.finalize(META);
    const daily = cache.metrics["HKQuantityTypeIdentifierStepCount"].daily;
    expect(daily["2022-11-25"] as SumBucket).toEqual({ sum: 300, count: 2 });
    expect(daily["2022-11-26"] as SumBucket).toEqual({ sum: 500, count: 1 });
  });

  it("measure: min/max/avg/count", () => {
    const agg = new Aggregator();
    agg.add(rec("HKQuantityTypeIdentifierHeartRate", 60, "2022-11-25 08:40:00 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierHeartRate", 90, "2022-11-25 20:00:00 +0200"));
    const b = agg.finalize(META).metrics["HKQuantityTypeIdentifierHeartRate"].daily["2022-11-25"] as MeasureBucket;
    expect(b).toEqual({ min: 60, max: 90, avg: 75, count: 2 });
  });

  it("duration: summiert Intervall-Minuten (value darf null sein)", () => {
    const agg = new Aggregator();
    agg.add(rec("HKCategoryTypeIdentifierSleepAnalysis", null, "2022-11-25 23:30:00 +0200", "2022-11-26 00:30:00 +0200"));
    const b = agg.finalize(META).metrics["HKCategoryTypeIdentifierSleepAnalysis"].daily["2022-11-25"] as DurationBucket;
    expect(b).toEqual({ minutes: 60, count: 1 });
  });

  it("skippt sum/measure ohne value, ohne den Tagesbereich zu berühren", () => {
    const agg = new Aggregator();
    agg.add(rec("HKQuantityTypeIdentifierStepCount", 500, "2022-11-26 07:00:00 +0200"));
    agg.add(rec("HKQuantityTypeIdentifierStepCount", null, "2022-11-27 07:00:00 +0200"));
    const cache = agg.finalize(META);
    expect(cache.recordCount).toBe(1);
    expect(cache.skippedCount).toBe(1);
    expect(cache.dateRange).toEqual({ from: "2022-11-26", to: "2022-11-26" });
  });

  it("sammelt Workouts und setzt unit aus erster Beobachtung", () => {
    const agg = new Aggregator();
    agg.add({ kind: "workout", activityType: "HKWorkoutActivityTypeX", startDate: "2022-11-25 18:00:00 +0200", endDate: "2022-11-25 18:30:30 +0200", duration: 30.5 });
    const cache = agg.finalize(META);
    expect(cache.workouts).toEqual([{ type: "HKWorkoutActivityTypeX", start: "2022-11-25T18:00", durationMin: 30.5 }]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- aggregator`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement**

```ts
// src/core/aggregator.ts
import { policyFor, type Policy } from "./aggregation-policy";
import { localDay, durationMinutes } from "./apple-date";
import type { HealthEvent } from "./health-parser";
import type { DayBucket, HealthCache, MetricSeries, WorkoutEntry } from "./types";

interface MeasureAcc { min: number; max: number; sum: number; count: number; }
interface SumAcc { sum: number; count: number; }
interface DurAcc { minutes: number; count: number; }
type Acc = MeasureAcc | SumAcc | DurAcc;

interface SeriesAcc { unit: string; policy: Policy; daily: Map<string, Acc>; }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const round = (n: number): number => Math.round(n * 100) / 100;

export class Aggregator {
  private series = new Map<string, SeriesAcc>();
  private workouts: WorkoutEntry[] = [];
  private recordCount = 0;
  private skippedCount = 0;
  private minDay: string | null = null;
  private maxDay: string | null = null;

  add(e: HealthEvent): void {
    if (e.kind === "workout") {
      this.workouts.push({
        type: e.activityType,
        start: e.startDate.slice(0, 16).replace(" ", "T"),
        durationMin: e.duration,
      });
      this.touchDay(localDay(e.startDate));
      return;
    }
    const policy = policyFor(e.type);
    if ((policy === "sum" || policy === "measure") && e.value === null) {
      this.skippedCount++;
      return;
    }
    this.recordCount++;
    const day = localDay(e.startDate);
    this.touchDay(day);

    let s = this.series.get(e.type);
    if (!s) { s = { unit: e.unit, policy, daily: new Map() }; this.series.set(e.type, s); }
    if (!s.unit && e.unit) s.unit = e.unit;

    if (policy === "sum") {
      const acc = (s.daily.get(day) as SumAcc) ?? { sum: 0, count: 0 };
      acc.sum += e.value as number;
      acc.count++;
      s.daily.set(day, acc);
    } else if (policy === "measure") {
      const v = e.value as number;
      const acc = (s.daily.get(day) as MeasureAcc) ?? { min: v, max: v, sum: 0, count: 0 };
      acc.min = Math.min(acc.min, v);
      acc.max = Math.max(acc.max, v);
      acc.sum += v;
      acc.count++;
      s.daily.set(day, acc);
    } else {
      const acc = (s.daily.get(day) as DurAcc) ?? { minutes: 0, count: 0 };
      acc.minutes += durationMinutes(e.startDate, e.endDate);
      acc.count++;
      s.daily.set(day, acc);
    }
  }

  private touchDay(day: string): void {
    if (!DAY_RE.test(day)) return;
    if (this.minDay === null || day < this.minDay) this.minDay = day;
    if (this.maxDay === null || day > this.maxDay) this.maxDay = day;
  }

  finalize(meta: { sourceFile: string; importedAt: string }): HealthCache {
    const metrics: Record<string, MetricSeries> = {};
    for (const [type, s] of this.series) {
      const daily: Record<string, DayBucket> = {};
      for (const [day, acc] of s.daily) {
        if (s.policy === "measure") {
          const m = acc as MeasureAcc;
          daily[day] = { min: m.min, max: m.max, avg: round(m.sum / m.count), count: m.count };
        } else if (s.policy === "sum") {
          const a = acc as SumAcc;
          daily[day] = { sum: round(a.sum), count: a.count };
        } else {
          const d = acc as DurAcc;
          daily[day] = { minutes: round(d.minutes), count: d.count };
        }
      }
      metrics[type] = { unit: s.unit, policy: s.policy, daily };
    }
    return {
      version: 1,
      sourceFile: meta.sourceFile,
      importedAt: meta.importedAt,
      recordCount: this.recordCount,
      skippedCount: this.skippedCount,
      dateRange: this.minDay && this.maxDay ? { from: this.minDay, to: this.maxDay } : null,
      metrics,
      workouts: this.workouts,
    };
  }
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `npm test -- aggregator`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/aggregator.ts tests/core/aggregator.test.ts
git commit -m "feat(core): daily-bucket aggregator (sum/measure/duration + workouts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `pipeline` — Chunks → HealthCache (+ Fixture-Integrationstest)

**Files:**
- Create: `src/core/pipeline.ts`
- Create: `tests/fixtures/mini-export.xml`
- Test: `tests/core/pipeline.test.ts`

**Interfaces:**
- Consumes: `XmlTokenizer` (Task 2), `eventFromTag` (Task 4), `Aggregator` (Task 5), `HealthCache` (Task 4).
- Produces: `interface AggregateMeta { sourceFile: string; importedAt: string }`, `function aggregateStream(chunks: AsyncIterable<string> | Iterable<string>, meta: AggregateMeta, onProgress?: (records: number) => void): Promise<HealthCache>`.

- [ ] **Step 1: Fixture anlegen**

```xml
<!-- tests/fixtures/mini-export.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [ <!ELEMENT HealthData (Record|Workout)*> ]>
<HealthData locale="de_DE">
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2022-11-25 08:39:02 +0200" endDate="2022-11-25 08:47:00 +0200" value="214"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2022-11-25 09:10:00 +0200" endDate="2022-11-25 09:20:00 +0200" value="86"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2022-11-26 07:00:00 +0200" endDate="2022-11-26 07:05:00 +0200" value="500"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" device="&lt;&lt;HKDevice: 0x1&gt;, name:Watch&gt;" unit="count/min" startDate="2022-11-25 08:40:00 +0200" endDate="2022-11-25 08:40:00 +0200" value="60"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Watch" unit="count/min" startDate="2022-11-25 20:00:00 +0200" endDate="2022-11-25 20:00:00 +0200" value="90"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Health" unit="kg" startDate="2022-11-25 16:31:00 +0200" endDate="2022-11-25 16:31:00 +0200" value="90.1">
  <MetadataEntry key="HKWasUserEntered" value="1"/>
 </Record>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" value="HKCategoryValueSleepAnalysisAsleepCore" startDate="2022-11-25 23:30:00 +0200" endDate="2022-11-26 00:30:00 +0200"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2022-11-27 07:00:00 +0200" endDate="2022-11-27 07:05:00 +0200"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="30.5" durationUnit="min" startDate="2022-11-25 18:00:00 +0200" endDate="2022-11-25 18:30:30 +0200">
  <MetadataEntry key="x" value="y"/>
 </Workout>
</HealthData>
```

- [ ] **Step 2: Failing test**

```ts
// tests/core/pipeline.test.ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { aggregateStream } from "../../src/core/pipeline";
import type { MeasureBucket, SumBucket, DurationBucket } from "../../src/core/types";

const XML = readFileSync(fileURLToPath(new URL("../fixtures/mini-export.xml", import.meta.url)), "utf8");
const META = { sourceFile: "mini-export.xml", importedAt: "2026-07-19T00:00:00.000Z" };

// Zerlegt den String in n-Zeichen-Chunks als Iterable.
function* chunked(s: string, size: number): Iterable<string> {
  for (let i = 0; i < s.length; i += size) yield s.slice(i, i + size);
}

describe("aggregateStream (Fixture, end-to-end)", () => {
  it("aggregiert korrekt — unabhängig von der Chunk-Größe", async () => {
    for (const size of [XML.length, 1, 4, 17, 64]) {
      const cache = await aggregateStream(chunked(XML, size), META);
      const step = cache.metrics["HKQuantityTypeIdentifierStepCount"].daily;
      expect(step["2022-11-25"] as SumBucket).toEqual({ sum: 300, count: 2 });
      expect(step["2022-11-26"] as SumBucket).toEqual({ sum: 500, count: 1 });
      expect(step["2022-11-27"]).toBeUndefined(); // ohne value → skipped

      const hr = cache.metrics["HKQuantityTypeIdentifierHeartRate"].daily["2022-11-25"] as MeasureBucket;
      expect(hr).toEqual({ min: 60, max: 90, avg: 75, count: 2 });

      const sleep = cache.metrics["HKCategoryTypeIdentifierSleepAnalysis"].daily["2022-11-25"] as DurationBucket;
      expect(sleep).toEqual({ minutes: 60, count: 1 });

      expect(cache.recordCount).toBe(7);
      expect(cache.skippedCount).toBe(1);
      expect(cache.dateRange).toEqual({ from: "2022-11-25", to: "2022-11-26" });
      expect(cache.workouts).toEqual([
        { type: "HKWorkoutActivityTypeTraditionalStrengthTraining", start: "2022-11-25T18:00", durationMin: 30.5 },
      ]);
    }
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test -- pipeline`
Expected: FAIL (Modul fehlt).

- [ ] **Step 4: Implement**

```ts
// src/core/pipeline.ts
import { XmlTokenizer, type StartTag } from "./xml-tokenizer";
import { eventFromTag } from "./health-parser";
import { Aggregator } from "./aggregator";
import type { HealthCache } from "./types";

export interface AggregateMeta { sourceFile: string; importedAt: string; }

const PROGRESS_EVERY = 250_000;

export async function aggregateStream(
  chunks: AsyncIterable<string> | Iterable<string>,
  meta: AggregateMeta,
  onProgress?: (records: number) => void,
): Promise<HealthCache> {
  const tok = new XmlTokenizer();
  const agg = new Aggregator();
  let seen = 0;

  const handle = (tag: StartTag): void => {
    const e = eventFromTag(tag);
    if (!e) return;
    agg.add(e);
    if (e.kind === "record") {
      seen++;
      if (onProgress && seen % PROGRESS_EVERY === 0) onProgress(seen);
    }
  };

  for await (const chunk of chunks as AsyncIterable<string>) {
    tok.feed(chunk, handle);
  }
  tok.end();
  return agg.finalize(meta);
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `npm test -- pipeline`
Expected: PASS (1 Test über 5 Chunk-Größen).

- [ ] **Step 6: Voller Testlauf + Typecheck**

Run: `npm test && npm run typecheck`
Expected: alle Tests grün, `tsc --noEmit` ohne Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/core/pipeline.ts tests/core/pipeline.test.ts tests/fixtures/mini-export.xml
git commit -m "feat(core): aggregateStream pipeline + end-to-end fixture test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `health-source` — Import-Datei finden + streamen (obsidian-Schicht)

**Files:**
- Create: `src/obsidian/health-source.ts`
- Test: `tests/obsidian/health-source.test.ts`
- Modify: `package.json` (Dependency `fflate`)

**Interfaces:**
- Consumes: nichts aus dem Core (nur `node:fs`, `node:path`, `fflate`).
- Produces:
  - `function pickImportFile(names: string[]): string | null` — wählt aus Dateinamen die jüngste `.zip`/`.xml` (lexikografisch letzte; Dateien sind datumspräfixiert).
  - `function isExportEntry(name: string): boolean` — `basename(name) === "Export.xml"`.
  - `function openImportSource(absPath: string): AsyncIterable<string>` — UTF-8-Chunks des Export-XML; bei `.zip` streamend via `fflate`, sonst direkter `fs`-Stream.

Nur `pickImportFile`/`isExportEntry` sind unit-getestet; der Streaming-Pfad wird durch den manuellen 2,6-GB-Smoke-Test (Task 8) abgedeckt.

- [ ] **Step 1: `fflate` installieren**

Run: `npm install fflate@^0.8`
Expected: `fflate` erscheint unter `dependencies` in `package.json`.

- [ ] **Step 2: Failing test (nur pure Helper)**

```ts
// tests/obsidian/health-source.test.ts
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
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npm test -- health-source`
Expected: FAIL (Modul fehlt).

- [ ] **Step 4: Implement**

```ts
// src/obsidian/health-source.ts
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
  rs.on("data", (c: Buffer) => { try { unzip.push(new Uint8Array(c), false); } catch (e) { fail(e); } });
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
        if (error) throw error;
        if (done) return;
        await new Promise<void>((res) => { resolveNext = res; });
      }
    },
  };
}
```

- [ ] **Step 5: Run — expect PASS + Typecheck**

Run: `npm test -- health-source && npm run typecheck`
Expected: PASS (2 Tests); `tsc` ohne Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/health-source.ts tests/obsidian/health-source.test.ts package.json package-lock.json
git commit -m "feat(obsidian): health-source — pick import file + fflate streaming unzip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `main.ts` — Import-Command verdrahten + Config-Änderungen

**Files:**
- Modify: `src/main.ts`
- Modify: `manifest.json` (`isDesktopOnly: true`)
- Modify: `.gitignore` (`health-cache.json`)
- Modify: `AGENTS.md` (Cache-Zeile präzisieren)

**Interfaces:**
- Consumes: `aggregateStream`/`AggregateMeta` (Task 6), `openImportSource`/`pickImportFile` (Task 7).
- Produces: Command `apple-health:import`; schreibt `<pluginDir>/health-cache.json`.

Nicht unit-getestet (Obsidian-Runtime-Integration). Verifikation: `npm run build` + manueller Smoke-Test am echten Export.

- [ ] **Step 1: `manifest.json` prüfen/setzen**

`isDesktopOnly` auf `true` setzen (falls nicht schon). Öffne `manifest.json` und stelle sicher: `"isDesktopOnly": true`.

- [ ] **Step 2: `.gitignore` erweitern**

Ergänze nach der `data.json`-Zeile:

```
# Geparster Cache — personenbezogen, lazy geladen, NIE committen
health-cache.json
```

- [ ] **Step 3: `main.ts` implementieren**

```ts
// src/main.ts
import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { join } from "node:path";
import { readdir, writeFile } from "node:fs/promises";
import { aggregateStream } from "./core/pipeline";
import { openImportSource, pickImportFile } from "./obsidian/health-source";

const CACHE_FILE = "health-cache.json";

export default class AppleHealthPlugin extends Plugin {
  onload(): void {
    this.addCommand({
      id: "import",
      name: "Import ausführen",
      callback: () => { void this.runImport(); },
    });
  }

  onunload(): void {}

  private async runImport(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice("Apple Health: nur auf dem Desktop verfügbar.");
      return;
    }
    const pluginDir = join(adapter.getBasePath(), this.manifest.dir ?? "");
    const importDir = join(pluginDir, "import");

    let names: string[];
    try {
      names = await readdir(importDir);
    } catch {
      new Notice("Apple Health: Ordner 'import/' nicht gefunden.");
      return;
    }
    const file = pickImportFile(names);
    if (!file) {
      new Notice("Apple Health: keine .zip/.xml in 'import/' gefunden.");
      return;
    }

    new Notice(`Apple Health: Import von ${file} gestartet …`);
    try {
      const cache = await aggregateStream(
        openImportSource(join(importDir, file)),
        { sourceFile: file, importedAt: new Date().toISOString() },
        (records) => new Notice(`Apple Health: ${records.toLocaleString()} Records …`),
      );
      await writeFile(join(pluginDir, CACHE_FILE), JSON.stringify(cache), "utf8");
      const types = Object.keys(cache.metrics).length;
      new Notice(`Apple Health: fertig — ${cache.recordCount.toLocaleString()} Records, ${types} Metriken, ${cache.workouts.length} Workouts.`);
    } catch (e) {
      new Notice(`Apple Health: Import fehlgeschlagen — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
```

- [ ] **Step 4: `AGENTS.md` Cache-Zeile präzisieren**

Ersetze die Zeile zu `data.json`-Cache durch:

```markdown
- **Cache in `health-cache.json`** (separate Datei im Plugin-Dir, **lazy** beim Öffnen des Dashboards geladen — nicht in `data.json`, das würde bei jedem Start blockieren). Geparste Tages-Aggregate. **Gitignored.**
```

- [ ] **Step 5: Build + Lint (Verifikation ohne Runtime)**

Run: `npm run build && npm run lint`
Expected: `tsc --noEmit` ohne Fehler, esbuild erzeugt `main.js`, eslint sauber.

- [ ] **Step 6: Manueller Smoke-Test (dokumentieren, nicht automatisiert)**

Deploy (`npm run deploy` mit gesetztem `OBSIDIAN_PLUGIN_DIR`, `import/2026-07-17_Health.zip` liegt im Plugin-Dir), dann in Obsidian Command „Apple Health: Import ausführen". Erwartung: Progress-Notices, am Ende `health-cache.json` mit `recordCount ≈ 5,6 Mio`, `dateRange` ~2017–2026, Metriken inkl. `StepCount`/`HeartRate`/`SleepAnalysis`, 768 Workouts. Ergebnis im PR/Log festhalten.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts manifest.json .gitignore AGENTS.md
git commit -m "feat: wire Apple Health import command + config

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Kit-first-Nachbereitung — REGISTRY + Cockpit

**Files:**
- Modify: `../REGISTRY.md` (Repo-übergreifend: `obsidian-plugins/REGISTRY.md`)
- Modify: `$VAULT/25_Coding/apple-health/apple-health.md` (Cockpit: `letzter_commit`, „Was wurde gemacht")

**Interfaces:** keine Code-Interfaces.

- [ ] **Step 1: REGISTRY-Einträge ergänzen (1. Exemplare)**

In `obsidian-plugins/REGISTRY.md` zwei Zeilen ergänzen (passende Sektion bzw. neue „Parsing / Streaming"):
- „Streaming XML-Tokenizer (dep-frei, chunk-robust, quote-/entity-aware, überspringt Decl/DOCTYPE/Kommentare)" → `apple-health/src/core/xml-tokenizer.ts` (`XmlTokenizer`) — Kit-Kandidat (1. Exemplar; bei 2. Consumer promoten).
- „Streaming-Unzip eines großen Zip-Entries (fflate `Unzip`+`AsyncUnzipInflate` ↔ `fs`-Stream, Backpressure, Basename-Match)" → `apple-health/src/obsidian/health-source.ts` (`openImportSource`) — Kit-Kandidat (1. Exemplar).

- [ ] **Step 2: Cockpit aktualisieren**

Im Cockpit `apple-health.md`: `letzter_commit` auf den letzten Hash setzen, unter „🧭 Warum & Entscheidungen" einen Eintrag „Streaming-Parser + Aggregation implementiert (Slice 1)" ergänzen.

- [ ] **Step 3: Commit (nur REGISTRY; Vault-Cockpit wird per clean-shutdown committet)**

```bash
# vom Repo-Root aus; .. = Dach-Repo obsidian-plugins
git -C .. add REGISTRY.md
git -C .. commit -m "docs(registry): add apple-health streaming tokenizer + unzip entries

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review (durchgeführt)

**Spec-Coverage:** Tokenizer (T2), 3 Policies (T3), Aggregation/Buckets (T5), Datum/TZ (T1), Cache-Format (T4-Types + T5-finalize), Zip+XML-Quelle/fflate (T7), lazy `health-cache.json` + Command (T8), Robustheit (skip/chunk-boundary in T2/T5/T6), Tests (T1–T7), Kit-first-REGISTRY (T9), Config-Änderungen `.gitignore`/`AGENTS.md`/`package.json` (T7/T8). Alle Spec-Abschnitte abgedeckt. WorkoutStatistics/GPX/Dashboard sind laut Spec **out of scope**.

**Placeholder-Scan:** keine TBD/TODO/„handle edge cases"-Platzhalter; jeder Code-Step enthält vollständigen Code.

**Typ-Konsistenz:** `StartTag`, `HealthEvent`(`RecordEvent`/`WorkoutEvent`), `HealthCache`/`MetricSeries`/`DayBucket`(`SumBucket`/`MeasureBucket`/`DurationBucket`)/`WorkoutEntry`, `aggregateStream`/`AggregateMeta`, `policyFor`/`Policy`, `localDay`/`durationMinutes`/`toEpochMs`, `pickImportFile`/`isExportEntry`/`openImportSource` — über alle Tasks konsistent benannt und verwendet.
