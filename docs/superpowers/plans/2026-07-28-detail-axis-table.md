# Slice 3c — Achsen-Beschriftung + Werte-Tabelle mit Export: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Detail-Chart bekommt Achsen-Beschriftung (x: Datum/KW/Monat, y: Werte, Montagslinien bei Tagesauflösung) und darunter eine aufklappbare Werte-Tabelle, die sich als Markdown oder CSV in die Zwischenablage oder als Datei ins Vault exportieren lässt.

**Architecture:** Alles Berechenbare liegt im dependency-freien Kern (`src/core/`) und ist in Node testbar: Tick-Auswahl, Label-Texte, Tabellenzeilen, beide Serialisierer, Pfadbau. Die Obsidian-Schicht (`src/obsidian/`) baut nur DOM, schreibt in die Zwischenablage und ins Vault. Der Export-Strang wird nicht neu erfunden — `copyToClipboard`, `renderTable`, die versionierte Pfadauflösung, `collapsibleSection` und `FolderSuggest` stammen aus dem Ökosystem (Details in der Spec).

**Tech Stack:** TypeScript, esbuild, vitest (node-Environment, Obsidian per `resolve.alias`-Mock), Obsidian-Plugin-API ≥ 1.8.7.

**Spec:** `docs/superpowers/specs/2026-07-28-detail-axis-table-design.md`

## Global Constraints

- **Kein `node:`-Import irgendwo in `src/`** — weder `node:fs`, `node:path` noch `getBasePath()`. Vault-Zugriff ausschließlich über `app.vault.adapter`. (Slice 3a hat das an der Wurzel beseitigt; ein Rückfall ist ein Store-Blocker.)
- **`src/core/` importiert niemals `obsidian`.** Die Trennung reiner Kern / Obsidian-Schicht ist verbindlich (PROF-OBS-03/04).
- **DOM nur über `createEl` / `createDiv` / `createSpan` / `createSvg` / `empty()`** — nie `innerHTML`, nie `document.createElement` (letzteres war eine Store-Scorecard-Warnung in 0.1.0).
- **Timer immer `window.setTimeout`**, nie `activeWindow.setTimeout` (`obsidianmd/prefer-window-timers`).
- **Nur Obsidian-Theme-Variablen im CSS**, kein `!important`, Klassenpräfix `ah-` (UI-STANDARD §3).
- **Button-Rollen:** Primäraktion `mod-cta`, sekundär klassenlos (UI-STANDARD §2).
- **i18n:** Jeder nutzersichtbare String läuft über `t("key")`; EN ist kanonisch, DE vollständig. Kein Hardcoding.
- **Vendorte Kit-Module** liegen in `src/vendor/kit-obsidian/` (obsidian-gekoppelt) bzw. `src/vendor/kit/` (pure), werden **nie von Hand editiert** und tragen eine `VENDOR.json` (UI-STANDARD §9).
- **`console.log` / `console.info` sind Store-verboten** — nur `warn`/`error`/`debug`.
- Kommandos: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.

---

## File Structure

**Neu:**

| Datei | Verantwortung |
|---|---|
| `src/core/serialize.ts` | Kopf + Zeilen → Markdown-Tabelle bzw. CSV-Text |
| `src/core/export-path.ts` | Dateinamen säubern, Pfadfragmente fügen, Exportnamen bauen |
| `src/obsidian/clipboard.ts` | Text in die Zwischenablage, mit Guard und Fehler-Notice |
| `src/obsidian/export-writer.ts` | Ordner anlegen, freien Pfad finden, Datei schreiben |
| `src/vendor/kit-obsidian/collapsible.ts` | Kit-Snapshot: Aufklapp-Sektion |
| `src/vendor/kit-obsidian/folder-suggest.ts` | Snapshot: Ordner-Autocomplete |
| `src/vendor/kit-obsidian/VENDOR.json` | Herkunfts-Pins beider Snapshots |
| `tests/core/serialize.test.ts`, `tests/core/export-path.test.ts` | |
| `tests/obsidian/clipboard.test.ts`, `tests/obsidian/export-writer.test.ts` | |

**Geändert:**

| Datei | Änderung |
|---|---|
| `vitest.config.ts` | Zeitzone der Testläufe festnageln |
| `src/i18n/strings.ts` | 13 neue Keys, EN + DE |
| `src/core/chart-geometry.ts` | `xTicks`, `weekMarks`, optionaler `opts`-Parameter |
| `src/core/format.ts` | `formatTickLabel` |
| `src/core/view-model.ts` | `AxisVM`, `TableVM`, beide im `DetailVM` |
| `src/obsidian/chart-render.ts` | Achsen-Layer, Wochenlinien |
| `src/obsidian/tabs/detail.ts` | Aufklapp-Sektion, Tabelle, Export-Zeile |
| `src/obsidian/dashboard-view.ts` | `DashboardHost` erweitert, `renderDetail` bekommt die View |
| `src/main.ts` | `PluginData` erweitert, Host-Methoden |
| `tests/__mocks__/obsidian.ts` | `AbstractInputSuggest`, `setCssStyles` als Element-Methode |
| `styles.css` | Achsen, Tabelle, Export-Zeile, Kit-Collapsible-CSS |
| `CHANGELOG.md` | Eintrag unter `## [Unreleased]` |

---

### Task 1: Zeitzonen-Härtung der Testläufe

Ohne diesen Schritt beweist der Label-Test in Task 4 nichts: In UTC ist ein fehlendes `timeZone: "UTC"` nicht von korrektem Code zu unterscheiden.

**Files:**
- Modify: `vitest.config.ts`

**Interfaces:**
- Consumes: nichts
- Produces: alle Testläufe des Repos laufen ab jetzt in `America/New_York`

- [ ] **Step 1: Zeitzone in der vitest-Config festnageln**

```ts
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Bewusst NICHT UTC: Die Datums-Formatierung (formatTickLabel) und die
    // Tagesbildung (apple-date.ts) sind nur dann beweisbar korrekt, wenn die
    // Testumgebung eine andere Zonenlage hat als die verarbeiteten Daten.
    // In UTC sieht fehlerhafter Code identisch zu korrektem aus.
    env: { TZ: "America/New_York" },
  },
  resolve: {
    alias: {
      // Mock-Alias gehoert in vitest, NIE in tsconfig.json (PROF-OBS-08):
      obsidian: fileURLToPath(new URL("./tests/__mocks__/obsidian.ts", import.meta.url)),
    },
  },
});
```

- [ ] **Step 2: Gesamte Suite laufen lassen**

Run: `npm test`
Expected: 119 Tests grün — **oder** einzelne Fehlschläge in `apple-date`, `rollup`, `aggregator`.

- [ ] **Step 3: Fallout bewerten (nicht stillschweigend reparieren)**

Falls Tests fallen: **nicht** die Zeitzone zurückdrehen und **nicht** den Test anpassen, bis er wieder grün ist. Jeder Fehlschlag ist ein realer Zeitzonen-Bug in Code, der zeitzonenbehaftete Apple-Daten verarbeitet. Notiere pro Fehlschlag Datei, Testname und die Differenz (erwartet/erhalten) und **melde sie als eigenen Befund**, bevor du weitermachst. Der Slice wird dadurch nicht blockiert — die neuen Module sind von den alten unabhängig.

- [ ] **Step 4: Commit**

```bash
git add vitest.config.ts
git commit -m "test: Testläufe auf America/New_York festnageln

Der UTC-Fallstrick bei Datums-Formatierung und Tagesbildung ist in einer
UTC-Testumgebung nicht beweisbar — fehlerhafter und korrekter Code liefern
dort dasselbe Ergebnis."
```

---

### Task 2: i18n-Keys für Achse, Tabelle und Export

Muss vor allen Tasks stehen, die `t()` mit den neuen Keys aufrufen (4, 7, 13, 14).

**Files:**
- Modify: `src/i18n/strings.ts`
- Test: `tests/i18n/strings.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: Keys `axis.week`, `table.title`, `table.colDate`, `table.colWeek`, `table.colMonth`, `table.colValue`, `export.copy`, `export.save`, `export.folder`, `export.copied`, `export.copyFailed`, `export.saved`, `export.saveFailed`

- [ ] **Step 1: Failing test schreiben**

Ans Ende von `tests/i18n/strings.test.ts` anfügen (der Paritätstest existiert bereits und deckt EN/DE-Vollständigkeit automatisch mit ab):

```ts
  it("Achsen-, Tabellen- und Export-Keys sind in beiden Sprachen belegt", () => {
    const keys = [
      "axis.week", "table.title", "table.colDate", "table.colWeek",
      "table.colMonth", "table.colValue", "export.copy", "export.save",
      "export.folder", "export.copied", "export.copyFailed",
      "export.saved", "export.saveFailed",
    ];
    for (const k of keys) {
      expect(EN[k], `EN fehlt: ${k}`).toBeTruthy();
      expect(DE[k], `DE fehlt: ${k}`).toBeTruthy();
    }
  });

  it("Platzhalter-Keys tragen ihren {0}-Slot in beiden Sprachen", () => {
    for (const k of ["export.copied", "export.saved", "export.saveFailed"]) {
      expect(EN[k]).toContain("{0}");
      expect(DE[k]).toContain("{0}");
    }
  });
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/i18n/strings.test.ts`
Expected: FAIL — `EN fehlt: axis.week`

- [ ] **Step 3: Keys ergänzen**

In `EN` (nach dem `range.*`-Block einfügen):

```ts
  // axis / table / export
  "axis.week": "W",
  "table.title": "Values",
  "table.colDate": "Date",
  "table.colWeek": "Week",
  "table.colMonth": "Month",
  "table.colValue": "Value",
  "export.copy": "Copy",
  "export.save": "Save",
  "export.folder": "Folder",
  "export.copied": "{0} rows copied",
  "export.copyFailed": "Copy failed",
  "export.saved": "Saved to {0}",
  "export.saveFailed": "Save failed: {0}",
```

In `DE` an der entsprechenden Stelle:

```ts
  "axis.week": "KW",
  "table.title": "Werte",
  "table.colDate": "Datum",
  "table.colWeek": "Woche",
  "table.colMonth": "Monat",
  "table.colValue": "Wert",
  "export.copy": "Kopieren",
  "export.save": "Speichern",
  "export.folder": "Ordner",
  "export.copied": "{0} Zeilen kopiert",
  "export.copyFailed": "Kopieren fehlgeschlagen",
  "export.saved": "Gespeichert: {0}",
  "export.saveFailed": "Speichern fehlgeschlagen: {0}",
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/i18n/strings.test.ts`
Expected: PASS (inklusive des bestehenden Paritätstests)

- [ ] **Step 5: Commit**

```bash
git add src/i18n/strings.ts tests/i18n/strings.test.ts
git commit -m "feat(i18n): Keys für Achsenbeschriftung, Werte-Tabelle und Export"
```

---

### Task 3: `chart-geometry` — Tick-Positionen und Wochenmarken

**Files:**
- Modify: `src/core/chart-geometry.ts`
- Test: `tests/core/chart-geometry.test.ts`

**Interfaces:**
- Consumes: `RollupPoint` (`{ key: string; value: number; min?: number; max?: number }`), `Granularity` (`"day" | "week" | "month"`) aus `src/core/rollup.ts`
- Produces:
  - `AXIS_TICKS: number` (= 5)
  - `ChartGeometry.xTicks: Array<{ i: number; x: number }>`
  - `ChartGeometry.weekMarks: number[]`
  - `buildChartGeometry(points, kind, dims, opts?: { granularity?: Granularity })`

- [ ] **Step 1: Failing tests schreiben**

Ans Ende des `describe("chart-geometry", …)`-Blocks in `tests/core/chart-geometry.test.ts`:

```ts
  it("ohne opts (Sparkline-Aufruf) bleiben xTicks und weekMarks leer", () => {
    const pts: RollupPoint[] = Array.from({ length: 30 }, (_, i) => ({
      key: `2026-07-${String(i + 1).padStart(2, "0")}`, value: i,
    }));
    const g = buildChartGeometry(pts, "line", dims);
    expect(g.xTicks).toEqual([]);
    expect(g.weekMarks).toEqual([]);
  });

  it("leere Serie → xTicks und weekMarks leer, kein Absturz", () => {
    const g = buildChartGeometry([], "bar", dims, { granularity: "day" });
    expect(g.xTicks).toEqual([]);
    expect(g.weekMarks).toEqual([]);
  });

  it("91 Punkte → 5 Ticks, gleichmäßiger Abstand, erster bei Index 0", () => {
    const pts: RollupPoint[] = Array.from({ length: 91 }, (_, i) => ({ key: `k${i}`, value: i }));
    const g = buildChartGeometry(pts, "line", dims, { granularity: "day" });
    expect(g.xTicks).toHaveLength(5);
    expect(g.xTicks[0].i).toBe(0);
    // step = ceil(91 / 5) = 19
    expect(g.xTicks.map((t) => t.i)).toEqual([0, 19, 38, 57, 76]);
  });

  it("weniger Punkte als Zielzahl → jeder Punkt bekommt einen Tick", () => {
    const pts: RollupPoint[] = [{ key: "a", value: 1 }, { key: "b", value: 2 }, { key: "c", value: 3 }];
    const g = buildChartGeometry(pts, "line", dims, { granularity: "day" });
    expect(g.xTicks.map((t) => t.i)).toEqual([0, 1, 2]);
  });

  it("ein Punkt → ein Tick, x mittig wie die Linie selbst", () => {
    const g = buildChartGeometry([{ key: "a", value: 1 }], "line", dims, { granularity: "day" });
    expect(g.xTicks).toHaveLength(1);
    // n <= 1: scaleX liefert padding + innerW / 2 = 5 + 45 = 50
    expect(g.xTicks[0].x).toBeCloseTo(50);
  });

  it("weekMarks: nur Montage, und nur bei Tagesgranularität", () => {
    // 2026-07-27 ist ein Montag, 2026-08-03 der nächste.
    const pts: RollupPoint[] = [
      { key: "2026-07-26", value: 1 }, // So
      { key: "2026-07-27", value: 2 }, // Mo
      { key: "2026-07-28", value: 3 }, // Di
      { key: "2026-08-03", value: 4 }, // Mo
    ];
    const day = buildChartGeometry(pts, "bar", dims, { granularity: "day" });
    expect(day.weekMarks).toHaveLength(2);

    const week = buildChartGeometry(pts, "bar", dims, { granularity: "week" });
    expect(week.weekMarks).toEqual([]);
    const month = buildChartGeometry(pts, "bar", dims, { granularity: "month" });
    expect(month.weekMarks).toEqual([]);
  });

  it("bar: Wochenlinie am Slot-Anfang, Tick in der Slot-Mitte", () => {
    const pts: RollupPoint[] = [
      { key: "2026-07-27", value: 1 }, // Mo, Index 0
      { key: "2026-07-28", value: 2 },
    ];
    const g = buildChartGeometry(pts, "bar", dims, { granularity: "day" });
    // innerW = 90, n = 2 → slotW = 45; Slot 0 beginnt bei padding = 5, Mitte bei 27.5
    expect(g.weekMarks[0]).toBeCloseTo(5);
    expect(g.xTicks[0].x).toBeCloseTo(27.5);
  });
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/chart-geometry.test.ts`
Expected: FAIL — `expected undefined to deeply equal []` (die Felder existieren noch nicht)

- [ ] **Step 3: Implementieren**

`src/core/chart-geometry.ts` — Importe und Typen oben ergänzen:

```ts
import type { RollupPoint, Granularity } from "./rollup";
import type { ChartKind } from "./metric-catalog";

/** Zielzahl der x-Labels. Bewusst niedrig: mehr Labels kollidieren in schmalen
 *  Sidebars, und der Gesamtzeitraum steht ohnehin im Kopf der Detail-Ansicht. */
export const AXIS_TICKS = 5;

export interface ChartDims { width: number; height: number; padding: number; }
export interface GeometryOpts { granularity?: Granularity; }
export interface ChartGeometry {
  kind: ChartKind;
  width: number; height: number;
  polyline: string;
  band: string;
  bars: Array<{ x: number; y: number; w: number; h: number }>;
  yTicks: Array<{ y: number; value: number }>;
  /** Nur Zahlen, keine Texte — das View-Model holt den Schlüssel über `i`. */
  xTicks: Array<{ i: number; x: number }>;
  weekMarks: number[];
}

/** Montag = 1 nach getUTCDay(). Der Key ist UTC-Mitternacht; ohne das "T00:00:00Z"
 *  interpretiert Node ihn zonenabhängig und der Wochentag kippt. */
function isMonday(key: string): boolean {
  return new Date(`${key}T00:00:00Z`).getUTCDay() === 1;
}
```

`empty` und den Rumpf anpassen:

```ts
export function buildChartGeometry(
  points: RollupPoint[], kind: ChartKind, dims: ChartDims, opts?: GeometryOpts,
): ChartGeometry {
  const { width, height, padding } = dims;
  const empty: ChartGeometry = {
    kind, width, height, polyline: "", band: "", bars: [], yTicks: [], xTicks: [], weekMarks: [],
  };
  if (points.length === 0) return empty;
```

Nach der `yTicks`-Zeile einfügen (vor dem `if (kind === "bar")`-Block):

```ts
  // Achsendaten entstehen nur auf Anfrage. Sparklines rufen dreiargumentig auf und
  // bekommen dieselbe Geometrie wie bisher — das hält die Übersicht unberührt.
  const g = opts?.granularity;
  const slotW = innerW / n;
  const tickX = (i: number): number => (kind === "bar" ? padding + i * slotW + slotW / 2 : scaleX(i));
  const xTicks: Array<{ i: number; x: number }> = [];
  const weekMarks: number[] = [];
  if (g) {
    const step = Math.max(1, Math.ceil(n / AXIS_TICKS));
    for (let i = 0; i < n; i += step) xTicks.push({ i, x: tickX(i) });
    if (g === "day") {
      for (let i = 0; i < n; i++) {
        // Der Strich grenzt die Woche ab, markiert also den Anfang des Montags-Slots
        // und nicht dessen Mitte — sonst steht er auf dem Balken statt vor ihm.
        if (isMonday(points[i].key)) weekMarks.push(kind === "bar" ? padding + i * slotW : scaleX(i));
      }
    }
  }
```

Die vorhandene `slotW`-Deklaration im `bar`-Zweig entfernen (sie ist jetzt oben deklariert) und beide `return`-Anweisungen um die neuen Felder ergänzen:

```ts
  if (kind === "bar") {
    const barW = slotW * 0.8;
    const base = scaleY(lo);
    const bars = points.map((p, i) => {
      const x = padding + i * slotW + slotW * 0.1;
      const y = scaleY(p.value);
      return { x, y, w: barW, h: Math.max(0, base - y) };
    });
    return { kind, width, height, polyline: "", band: "", bars, yTicks, xTicks, weekMarks };
  }
```

… und analog im Linien-Zweig `xTicks, weekMarks` an das Rückgabeobjekt anhängen.

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/core/chart-geometry.test.ts`
Expected: PASS (alle, auch die bestehenden)

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: sauber — `view-model.ts` ruft `buildChartGeometry` dreiargumentig auf, was durch das optionale `opts` weiterhin gültig ist.

- [ ] **Step 6: Commit**

```bash
git add src/core/chart-geometry.ts tests/core/chart-geometry.test.ts
git commit -m "feat(core): Tick-Positionen und Wochenmarken in der Chart-Geometrie

Beide Felder entstehen nur mit granularity-Option; der dreiargumentige
Sparkline-Aufruf liefert unverändert dieselbe Geometrie wie zuvor."
```

---

### Task 4: `format` — Achsenbeschriftung aus Rollup-Schlüsseln

**Files:**
- Modify: `src/core/format.ts`
- Test: `tests/core/format.test.ts`

**Interfaces:**
- Consumes: `Granularity` aus `src/core/rollup.ts`; `t` aus `src/vendor/kit/i18n`; `localeTag` aus `src/i18n/strings`
- Produces: `formatTickLabel(key: string, g: Granularity): string`

- [ ] **Step 1: Failing tests schreiben**

Ans Ende von `tests/core/format.test.ts` (Import oben ergänzen: `import { formatTickLabel } from "../../src/core/format";` — falls die Datei bereits aus demselben Modul importiert, den bestehenden Import erweitern; `setLang` kommt aus `"../../src/i18n/strings"`):

```ts
describe("formatTickLabel", () => {
  // Das Test-Setup setzt "de"; die Zeitzone der Suite ist America/New_York.
  it("Tag: zeigt den Tag des Schlüssels, nicht den Vortag (UTC-Fallstrick)", () => {
    const label = formatTickLabel("2026-07-28", "day");
    expect(label).toContain("28");
    expect(label).toContain("07");
    expect(label).not.toContain("27");
  });

  it("Woche: Kalenderwoche aus dem Schlüssel, ohne führende Null", () => {
    expect(formatTickLabel("2026-W30", "week")).toBe("KW 30");
    expect(formatTickLabel("2026-W05", "week")).toBe("KW 5");
  });

  it("Monat: Kurzmonat und zweistelliges Jahr", () => {
    const label = formatTickLabel("2026-07", "month");
    expect(label).toMatch(/Jul/);
    expect(label).toContain("26");
  });

  it("Woche auf Englisch nutzt den englischen Präfix", () => {
    setLang("en");
    expect(formatTickLabel("2026-W30", "week")).toBe("W 30");
    setLang("de");
  });

  it("Monatswechsel am 1. bleibt im richtigen Monat", () => {
    // Ohne timeZone: "UTC" läge dieser Tag in New York noch im Juni.
    const label = formatTickLabel("2026-07-01", "day");
    expect(label).toContain("07");
    expect(label).not.toContain("06");
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/format.test.ts`
Expected: FAIL — `formatTickLabel is not a function`

- [ ] **Step 3: Implementieren**

In `src/core/format.ts` die Importe erweitern und die Funktion anhängen:

```ts
import { localeTag } from "../i18n/strings";
import { t } from "../vendor/kit/i18n";
import type { Granularity } from "./rollup";

/**
 * Achsenbeschriftung aus einem RollupPoint-Schlüssel.
 *   day   "2026-07-28" → "28.07." (de) / "07/28" (en)
 *   week  "2026-W30"   → "KW 30"  (de) / "W 30"  (en)
 *   month "2026-07"    → "Jul 26"
 *
 * `timeZone: "UTC"` ist load-bearing, nicht kosmetisch: Die Schlüssel stehen für
 * UTC-Mitternacht. Ohne die Option formatiert Node sie in der lokalen Zone — in
 * jeder Zone westlich von Greenwich rutscht damit jedes Label einen Tag zurück,
 * und am Monatsersten sogar in den Vormonat.
 */
export function formatTickLabel(key: string, g: Granularity): string {
  if (g === "week") {
    const week = Number(key.slice(key.indexOf("W") + 1));
    return `${t("axis.week")} ${week}`;
  }
  if (g === "month") {
    return new Date(`${key}-01T00:00:00Z`).toLocaleDateString(localeTag(), {
      month: "short", year: "2-digit", timeZone: "UTC",
    });
  }
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(localeTag(), {
    day: "2-digit", month: "2-digit", timeZone: "UTC",
  });
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/core/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/format.ts tests/core/format.test.ts
git commit -m "feat(core): formatTickLabel für Tages-, Wochen- und Monatsachsen

Formatierung mit timeZone: UTC — die Rollup-Schlüssel stehen für
UTC-Mitternacht und rutschen sonst westlich von Greenwich einen Tag zurück."
```

---

### Task 5: `serialize` — Markdown- und CSV-Serialisierung

**Files:**
- Create: `src/core/serialize.ts`
- Test: `tests/core/serialize.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `toMarkdownTable(headers: string[], rows: string[][]): string`, `toCsv(headers: string[], rows: string[][]): string`

- [ ] **Step 1: Failing tests schreiben**

`tests/core/serialize.test.ts`:

```ts
import { toCsv, toMarkdownTable } from "../../src/core/serialize";

describe("toMarkdownTable", () => {
  it("Kopf, Trennzeile und Datenzeilen", () => {
    const md = toMarkdownTable(["Datum", "Wert"], [["2026-07-28", "72"]]);
    expect(md).toBe("| Datum | Wert |\n| --- | --- |\n| 2026-07-28 | 72 |");
  });

  it("Pipe in einer Zelle bleibt eine Zelle (re-escaped)", () => {
    const md = toMarkdownTable(["A"], [["x|y"]]);
    expect(md).toContain("| x\\|y |");
    // Ohne Escaping hätte die Datenzeile mehr Spalten als der Kopf.
    const cells = md.split("\n")[2].split(/(?<!\\)\|/).filter((c) => c.trim());
    expect(cells).toHaveLength(1);
  });

  it("ohne Zeilen bleiben Kopf und Trennzeile", () => {
    expect(toMarkdownTable(["A", "B"], [])).toBe("| A | B |\n| --- | --- |");
  });
});

describe("toCsv", () => {
  it("Kopf und Zeilen mit Komma getrennt", () => {
    expect(toCsv(["Datum", "Wert"], [["2026-07-28", "72"]])).toBe("Datum,Wert\n2026-07-28,72");
  });

  it("Zelle mit Komma wird gequotet", () => {
    expect(toCsv(["A"], [["1,5"]])).toBe('A\n"1,5"');
  });

  it("Anführungszeichen werden verdoppelt und die Zelle gequotet", () => {
    expect(toCsv(["A"], [['sagt "hallo"']])).toBe('A\n"sagt ""hallo"""');
  });

  it("Zeilenumbruch in einer Zelle wird gequotet", () => {
    expect(toCsv(["A"], [["a\nb"]])).toBe('A\n"a\nb"');
  });

  it("harmlose Zellen bleiben unquotiert", () => {
    expect(toCsv(["A"], [["72.5"]])).toBe("A\n72.5");
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/serialize.test.ts`
Expected: FAIL — Modul `src/core/serialize` nicht gefunden

- [ ] **Step 3: Implementieren**

`src/core/serialize.ts`:

```ts
/**
 * Serialisierung von Kopf + Zeilen in die beiden Exportformate.
 * Der Markdown-Teil ist aus `vault-rag/src/reformat_mechanical.ts` übernommen
 * (renderTable/escapeCell); der CSV-Teil ist im Ökosystem das erste Exemplar.
 */

/** Ein literales `|` muss re-escaped werden, sonst zerfällt die Zelle beim
 *  Rendern in zwei und die Datenzeile hat mehr Spalten als der Kopf. */
function escapeCell(cell: string): string {
  return cell.replace(/\|/g, "\\|");
}

export function toMarkdownTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(escapeCell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(escapeCell).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

/** Quoting nach RFC 4180: nur wenn nötig, enthaltene Anführungszeichen verdoppelt. */
function csvCell(cell: string): string {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Zeilenende `\n` statt des von RFC 4180 verlangten `\r\n` — Ziel ist ein
 *  Obsidian-Vault, und jede gängige Tabellenkalkulation liest beides. */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/core/serialize.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/serialize.ts tests/core/serialize.test.ts
git commit -m "feat(core): Markdown- und CSV-Serialisierung für den Werte-Export

Markdown-Teil aus vault-rag übernommen (renderTable/escapeCell)."
```

---

### Task 6: `export-path` — Dateinamen und Pfadfragmente

**Files:**
- Create: `src/core/export-path.ts`
- Test: `tests/core/export-path.test.ts`

**Interfaces:**
- Consumes: nichts
- Produces: `sanitizeBase(name: string): string`, `joinPath(dir: string, file: string): string`, `buildExportName(metricName: string, from: string, to: string): string` (Basename **ohne** Endung — das Kollisions-Suffix muss vor die Endung, deshalb hängt `writeExport` sie in Task 10 selbst an)

- [ ] **Step 1: Failing tests schreiben**

`tests/core/export-path.test.ts`:

```ts
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
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/export-path.test.ts`
Expected: FAIL — Modul nicht gefunden

- [ ] **Step 3: Implementieren**

`src/core/export-path.ts`:

```ts
/**
 * Pfad- und Namensbau für den Werte-Export. Übernommen aus
 * `obsidian-paperize/src/obsidian/output.ts` und `epub-exporter/src/core/output-path.ts`
 * (dort byte-nah identisch). Die Kollisionszählung selbst lebt bewusst NICHT hier,
 * weil sie `adapter.exists` awaiten muss und dieser Kern obsidian-frei bleibt.
 */

export function sanitizeBase(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "Export";
}

/** Fügt zwei vault-relative Fragmente ohne Slash-Rauschen zusammen. */
export function joinPath(dir: string, file: string): string {
  const d = (dir || "").replace(/^\/+|\/+$/g, "");
  return d ? `${d}/${file}` : file;
}

/** Basename ohne Endung. `from`/`to` sind die Schlüssel des ersten und letzten
 *  tatsächlich vorhandenen Punkts — der Name beschreibt damit die enthaltenen
 *  Daten, nicht den angeforderten Zeitraum. */
export function buildExportName(metricName: string, from: string, to: string): string {
  return sanitizeBase(`${metricName} ${from}–${to}`);
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/core/export-path.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/export-path.ts tests/core/export-path.test.ts
git commit -m "feat(core): Dateinamens- und Pfadbau für den Export

Übernommen aus paperize/epub-exporter."
```

---

### Task 7: `view-model` — Achsen und Tabelle im DetailVM

**Files:**
- Modify: `src/core/view-model.ts`
- Test: `tests/core/view-model.test.ts`

**Interfaces:**
- Consumes: `buildChartGeometry(..., opts)` und `AXIS_TICKS` (Task 3), `formatTickLabel` (Task 4), Tabellen-Keys (Task 2)
- Produces:
  - `AxisVM { x: Array<{ leftPct: number; label: string }>; y: Array<{ topPct: number; label: string }> }`
  - `TableVM { headers: string[]; rows: string[][]; rowsRaw: string[][] }`
  - `DetailVM.axis: AxisVM`, `DetailVM.table: TableVM`

- [ ] **Step 1: Failing tests schreiben**

Ans Ende von `tests/core/view-model.test.ts`. Die Datei hat bereits einen `cache`-artigen Fixture-Aufbau — der folgende Block bringt seinen eigenen mit, damit er unabhängig lesbar ist:

```ts
describe("buildDetailVM — Achse und Tabelle", () => {
  const dims = { width: 640, height: 260, padding: 24 };

  const measureCache: HealthCache = {
    version: 1, sourceFile: "", importedAt: "", recordCount: 3, skippedCount: 0,
    dateRange: { from: "2026-07-27", to: "2026-07-29" },
    metrics: {
      HKQuantityTypeIdentifierRestingHeartRate: {
        unit: "bpm", policy: "measure",
        daily: {
          "2026-07-27": { min: 50, max: 90, avg: 60, count: 2 },
          "2026-07-28": { min: 55, max: 95, avg: 72.3456, count: 2 },
        },
      },
    },
    workouts: [],
  };

  const sumCache: HealthCache = {
    version: 1, sourceFile: "", importedAt: "", recordCount: 1, skippedCount: 0,
    dateRange: { from: "2026-07-27", to: "2026-07-28" },
    metrics: {
      HKQuantityTypeIdentifierStepCount: {
        unit: "count", policy: "sum",
        daily: { "2026-07-28": { sum: 8000, count: 1 } },
      },
    },
    workouts: [],
  };

  it("measure: vier Spalten, Einheit im Kopf statt in den Zellen", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    expect(vm.table.headers).toHaveLength(4);
    expect(vm.table.headers[1]).toContain("bpm");
    // Keine Zelle trägt die Einheit
    for (const row of vm.table.rows) {
      for (const cell of row) expect(cell).not.toContain("bpm");
    }
  });

  it("sum: zwei Spalten", () => {
    const vm = buildDetailVM(sumCache, "HKQuantityTypeIdentifierStepCount", "1M", dims);
    expect(vm.table.headers).toHaveLength(2);
    expect(vm.table.rows[0]).toHaveLength(2);
  });

  it("erste Spalte trägt den rohen Schlüssel, nicht das Achsenformat", () => {
    const vm = buildDetailVM(sumCache, "HKQuantityTypeIdentifierStepCount", "1M", dims);
    expect(vm.table.rows[0][0]).toBe("2026-07-28");
  });

  it("rows sind locale-formatiert, rowsRaw tragen Punkt-Dezimalzahlen", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    const i = vm.table.rows.findIndex((r) => r[0] === "2026-07-28");
    expect(vm.table.rows[i][1]).toBe("72,3");    // de-DE, gerundet wie formatValue
    expect(vm.table.rowsRaw[i][1]).toBe("72.346"); // roh, Punkt, 3 Nachkommastellen
  });

  it("Achse: x-Labels tragen Prozentpositionen zwischen 0 und 100", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    expect(vm.axis.x.length).toBeGreaterThan(0);
    for (const tick of vm.axis.x) {
      expect(tick.leftPct).toBeGreaterThanOrEqual(0);
      expect(tick.leftPct).toBeLessThanOrEqual(100);
      expect(tick.label).toBeTruthy();
    }
  });

  it("Achse: drei y-Labels ohne Einheit", () => {
    const vm = buildDetailVM(measureCache, "HKQuantityTypeIdentifierRestingHeartRate", "1M", dims);
    expect(vm.axis.y).toHaveLength(3);
    for (const tick of vm.axis.y) expect(tick.label).not.toContain("bpm");
  });

  it("unbekannte Metrik → leere Achse und leere Tabelle statt Absturz", () => {
    const vm = buildDetailVM(measureCache, "GibtsNicht", "1M", dims);
    expect(vm.empty).toBe(true);
    expect(vm.axis.x).toEqual([]);
    expect(vm.axis.y).toEqual([]);
    expect(vm.table.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/core/view-model.test.ts`
Expected: FAIL — `Cannot read properties of undefined (reading 'headers')`

- [ ] **Step 3: Implementieren**

In `src/core/view-model.ts` die Importe ergänzen:

```ts
import { resolveRange, rollupDaily, type RangeKey, type RollupPoint, type Granularity } from "./rollup";
import { formatValue, formatTickLabel } from "./format";
import type { Policy } from "./types";
```

Typen ergänzen:

```ts
export interface AxisVM {
  x: Array<{ leftPct: number; label: string }>;
  y: Array<{ topPct: number; label: string }>;
}
export interface TableVM {
  headers: string[];
  rows: string[][];     // locale-formatiert — Anzeige und Markdown
  rowsRaw: string[][];  // rohe Zahlen mit Punkt — CSV
}
export interface DetailVM {
  id: string; name: string; unit: string; empty: boolean;
  rangeLabel: string; chart: ChartGeometry; stats: StatRow[];
  axis: AxisVM; table: TableVM;
}

const EMPTY_TABLE: TableVM = { headers: [], rows: [], rowsRaw: [] };
const EMPTY_AXIS: AxisVM = { x: [], y: [] };
```

Tabellenbau als Modulfunktionen:

```ts
function colDateKey(g: Granularity): string {
  if (g === "week") return "table.colWeek";
  if (g === "month") return "table.colMonth";
  return "table.colDate";
}

/** Die Einheit steht im Kopf, nie in der Zelle: sonst wiederholt sie sich
 *  hundertfach und macht die Werte für Weiterverarbeitung unbrauchbar. */
function withUnit(label: string, unit: string): string {
  return unit ? `${label} (${unit})` : label;
}

function fmtCell(n: number | undefined): string {
  return n === undefined ? "—" : formatValue(n, "");
}

/** Rohwert fürs CSV: Punkt-Dezimaltrenner, drei Nachkommastellen. formatValue
 *  liefert auf Deutsch "1.234,5" — das zerlegt eine komma-getrennte CSV-Zelle,
 *  und selbst gequotet liest eine Tabellenkalkulation den Wert als Text. */
function rawCell(n: number | undefined): string {
  return n === undefined ? "" : String(Math.round(n * 1000) / 1000);
}

function buildTable(points: RollupPoint[], policy: Policy, unit: string, g: Granularity): TableVM {
  const dateCol = t(colDateKey(g));
  if (policy === "measure") {
    return {
      headers: [
        dateCol,
        withUnit(t("stat.avg"), unit),
        withUnit(t("stat.min"), unit),
        withUnit(t("stat.max"), unit),
      ],
      rows: points.map((p) => [p.key, fmtCell(p.value), fmtCell(p.min), fmtCell(p.max)]),
      rowsRaw: points.map((p) => [p.key, rawCell(p.value), rawCell(p.min), rawCell(p.max)]),
    };
  }
  return {
    headers: [dateCol, withUnit(t("table.colValue"), unit)],
    rows: points.map((p) => [p.key, fmtCell(p.value)]),
    rowsRaw: points.map((p) => [p.key, rawCell(p.value)]),
  };
}
```

`buildDetailVM` anpassen — der Frühausstieg bekommt die leeren Felder:

```ts
  if (!series || !cache.dateRange) {
    return {
      id: metricId, name: metricId, unit: "", empty: true, rangeLabel: "",
      chart: buildChartGeometry([], "line", dims), stats: [],
      axis: EMPTY_AXIS, table: EMPTY_TABLE,
    };
  }
```

… und der Hauptpfad die Achsen- und Tabellendaten:

```ts
  const chart = buildChartGeometry(points, info.chartKind, dims, { granularity: r.granularity });
  // Die Prozentumrechnung passiert hier, damit die Obsidian-Schicht keine
  // Koordinatenrechnung enthält. Die Wochenlinien bleiben bewusst außen vor:
  // sie werden IM SVG gezeichnet und brauchen viewBox-Einheiten.
  const axis: AxisVM = {
    x: chart.xTicks.map((tick) => ({
      leftPct: (tick.x / dims.width) * 100,
      label: formatTickLabel(points[tick.i].key, r.granularity),
    })),
    y: chart.yTicks.map((tick) => ({
      topPct: (tick.y / dims.height) * 100,
      label: formatValue(tick.value, ""),
    })),
  };
  const table = buildTable(points, series.policy, series.unit, r.granularity);
```

… und beide Felder ins Rückgabeobjekt aufnehmen:

```ts
  return { id: metricId, name: info.name, unit: series.unit, empty: points.length === 0, rangeLabel, chart, stats, axis, table };
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/core/view-model.test.ts`
Expected: PASS

**Wenn die Rundungs-Assertion (`"72,3"` / `"72.346"`) fehlschlägt:** Nicht den Produktionscode an den Test anpassen, sondern erst prüfen, was `formatValue` tatsächlich liefert (`Math.abs(n) >= 100` rundet ganzzahlig, sonst auf eine Nachkommastelle) und den erwarteten Wert entsprechend korrigieren.

- [ ] **Step 5: Volle Suite + Typecheck**

Run: `npm test && npm run typecheck`
Expected: alles grün — `detail.ts` liest die neuen Felder noch nicht, bricht also nicht.

- [ ] **Step 6: Commit**

```bash
git add src/core/view-model.ts tests/core/view-model.test.ts
git commit -m "feat(core): Achsen-Labels und Werte-Tabelle im DetailVM

Zwei Zeilensätze: locale-formatiert für Anzeige/Markdown, roh mit
Punkt-Dezimaltrenner fürs CSV."
```

---

### Task 8: Kit-Module vendoren und den Obsidian-Mock erweitern

**Files:**
- Create: `src/vendor/kit-obsidian/collapsible.ts`, `src/vendor/kit-obsidian/folder-suggest.ts`, `src/vendor/kit-obsidian/VENDOR.json`
- Modify: `tests/__mocks__/obsidian.ts`
- Test: `tests/obsidian/collapsible.test.ts`

**Interfaces:**
- Consumes: nichts aus diesem Plan
- Produces:
  - `collapsibleSection(containerEl: HTMLElement, opts: CollapsibleOptions): HTMLElement`
  - `CollapsibleStorage { getCollapsed(key: string): boolean | undefined; setCollapsed(key: string, collapsed: boolean): void }`
  - `COLLAPSIBLE_CSS: string`
  - `class FolderSuggest extends AbstractInputSuggest<string>` mit `constructor(app: App, textInputEl: HTMLInputElement)`

- [ ] **Step 1: Snapshots kopieren (nicht abtippen, nicht editieren)**

```bash
mkdir -p src/vendor/kit-obsidian
cp ../obsidian-kit/src/obsidian/collapsible.ts src/vendor/kit-obsidian/collapsible.ts
cp ../kuro-gamification/src/vendor/kit/folder-suggest.ts src/vendor/kit-obsidian/folder-suggest.ts
```

- [ ] **Step 2: Herkunfts-Pin anlegen**

`src/vendor/kit-obsidian/VENDOR.json`:

```json
{
  "note": "Verbatim snapshots. Never hand-edit. Re-copy from the source to update.",
  "modules": [
    {
      "file": "collapsible.ts",
      "source": "obsidian-kit",
      "version": "0.16.1",
      "sha": "00fdd72"
    },
    {
      "file": "folder-suggest.ts",
      "source": "kuro-gamification/src/vendor/kit/folder-suggest.ts",
      "status": "Kit-Kandidat (REGISTRY §36) — noch nicht im Kit; Ursprungskette vault-rag → local-image-generator → kuro-gamification",
      "note": "Liegt hier nach UI-STANDARD §9 in kit-obsidian/, weil das Modul `obsidian` importiert. In kuro-gamification liegt es noch unter vendor/kit/ — den Fehler nicht zurückportieren."
    }
  ]
}
```

- [ ] **Step 3: Mock um die beiden benötigten API-Stellen erweitern**

In `tests/__mocks__/obsidian.ts` innerhalb von `makeEl()` neben `setAttribute` ergänzen:

```ts
    setCssStyles(styles: Record<string, string>) { Object.assign(el.style, styles); },
```

Und am Dateiende die Basisklasse für den Suggest ergänzen:

```ts
export class AbstractInputSuggest<T> {
  app: any;
  constructor(app?: any, _inputEl?: any) { this.app = app; }
  setValue(_v: string) {}
  close() {}
  getSuggestions(_q: string): T[] { return []; }
  renderSuggestion(_item: T, _el: any): void {}
  selectSuggestion(_item: T, _evt: any): void {}
}
```

- [ ] **Step 4: Failing test schreiben**

`tests/obsidian/collapsible.test.ts`:

```ts
import { collapsibleSection, resolveCollapsed } from "../../src/vendor/kit-obsidian/collapsible";

function fakeEl(): any {
  const el: any = {
    children: [] as any[], cls: "", text: "", handlers: {} as Record<string, any>, attrs: {} as Record<string, string>,
    createDiv(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; el.children.push(c); return c; },
    createEl(_t: string, o?: any) { const c = fakeEl(); c.text = (o && o.text) || ""; el.children.push(c); return c; },
    createSpan(o?: any) { const c = fakeEl(); c.cls = (o && o.cls) || ""; c.text = (o && o.text) || ""; el.children.push(c); return c; },
    setAttribute(n: string, v: string) { el.attrs[n] = v; },
    addEventListener(ev: string, cb: any) { el.handlers[ev] = cb; },
    toggleClass() {}, addClass() {}, setText() {},
  };
  return el;
}

describe("collapsibleSection (vendored)", () => {
  it("gibt den Body-Container zurück", () => {
    const host = fakeEl();
    const body = collapsibleSection(host, { title: "Werte" });
    expect(body).toBeTruthy();
  });

  it("Klick auf den Header meldet den neuen Zustand an den Storage", () => {
    const host = fakeEl();
    const saved: Array<[string, boolean]> = [];
    collapsibleSection(host, {
      title: "Werte", key: "detail-values", defaultCollapsed: true,
      storage: { getCollapsed: () => undefined, setCollapsed: (k, c) => { saved.push([k, c]); } },
    });
    const header = host.children[0].children[0];
    header.handlers.click();
    expect(saved).toEqual([["detail-values", false]]);
  });

  it("persistierter Zustand schlägt den Default", () => {
    expect(resolveCollapsed("k", true, { getCollapsed: () => false, setCollapsed() {} })).toBe(false);
    expect(resolveCollapsed("k", false, { getCollapsed: () => undefined, setCollapsed() {} })).toBe(false);
  });
});
```

- [ ] **Step 5: Test laufen lassen**

Run: `npx vitest run tests/obsidian/collapsible.test.ts`
Expected: PASS

Falls der Header-Zugriff (`host.children[0].children[0]`) danebengreift, lies die tatsächliche Struktur in `src/vendor/kit-obsidian/collapsible.ts` nach (`section` → `header` → `chevron`/`title`, dann `body`) und korrigiere **den Test** — die Vendor-Datei bleibt unangetastet.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: sauber

- [ ] **Step 7: Commit**

```bash
git add src/vendor/kit-obsidian tests/__mocks__/obsidian.ts tests/obsidian/collapsible.test.ts
git commit -m "chore(vendor): collapsibleSection (Kit 0.16.1) + FolderSuggest übernommen

Ablage nach UI-STANDARD §9 in kit-obsidian/, da beide Module obsidian
importieren. Mock um AbstractInputSuggest und setCssStyles erweitert."
```

---

### Task 9: `clipboard` — Kopieren mit Guard

**Files:**
- Create: `src/obsidian/clipboard.ts`
- Test: `tests/obsidian/clipboard.test.ts`

**Interfaces:**
- Consumes: `export.copyFailed` (Task 2)
- Produces: `copyToClipboard(text: string, onCopied?: () => void): void`

- [ ] **Step 1: Failing tests schreiben**

`tests/obsidian/clipboard.test.ts`:

```ts
import { copyToClipboard } from "../../src/obsidian/clipboard";

describe("copyToClipboard", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("ohne navigator.clipboard: kein Throw, kein Callback", () => {
    vi.stubGlobal("navigator", {});
    const onCopied = vi.fn();
    expect(() => copyToClipboard("x", onCopied)).not.toThrow();
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("Erfolg ruft den Callback mit dem übergebenen Text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();
    copyToClipboard("hallo", onCopied);
    await vi.waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("hallo");
  });

  it("abgelehntes writeText schlägt nicht durch", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();
    expect(() => copyToClipboard("x", onCopied)).not.toThrow();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(onCopied).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/obsidian/clipboard.test.ts`
Expected: FAIL — Modul nicht gefunden

- [ ] **Step 3: Implementieren**

`src/obsidian/clipboard.ts`:

```ts
import { Notice } from "obsidian";
import { t } from "../vendor/kit/i18n";

/**
 * Text in die Zwischenablage schreiben. Übernommen aus
 * `json_viewer/src/obsidian/clipboard.ts`.
 *
 * Der `!clipboard`-Guard steht VOR jedem Zugriff und ist nicht defensiv-dekorativ:
 * In non-secure Contexts (ältere Android-WebViews) wirft bereits das Lesen von
 * `navigator.clipboard.writeText` synchron — ein try/catch um den Aufruf käme
 * dafür zu spät.
 */
export function copyToClipboard(text: string, onCopied?: () => void): void {
  const clipboard = navigator.clipboard;
  if (!clipboard) {
    new Notice(t("export.copyFailed"));
    return;
  }
  clipboard.writeText(text).then(
    () => onCopied?.(),
    () => { new Notice(t("export.copyFailed")); },
  );
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/obsidian/clipboard.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/clipboard.ts tests/obsidian/clipboard.test.ts
git commit -m "feat(obsidian): copyToClipboard mit Guard gegen fehlende Clipboard-API

Übernommen aus json_viewer."
```

---

### Task 10: `export-writer` — Datei ins Vault schreiben

**Files:**
- Create: `src/obsidian/export-writer.ts`
- Test: `tests/obsidian/export-writer.test.ts`

**Interfaces:**
- Consumes: `sanitizeBase`, `joinPath` (Task 6)
- Produces: `writeExport(app: App, folder: string, baseName: string, ext: string, content: string): Promise<string>` — gibt den geschriebenen Pfad zurück

- [ ] **Step 1: Failing tests schreiben**

`tests/obsidian/export-writer.test.ts`:

```ts
import { writeExport } from "../../src/obsidian/export-writer";

function fakeApp(existing: string[] = []) {
  const written: Array<[string, string]> = [];
  const dirs: string[] = [];
  const app: any = {
    vault: {
      adapter: {
        exists: (p: string) => Promise.resolve(existing.includes(p)),
        mkdir: (p: string) => { dirs.push(p); return Promise.resolve(); },
        write: (p: string, c: string) => { written.push([p, c]); return Promise.resolve(); },
      },
    },
  };
  return { app, written, dirs };
}

describe("writeExport", () => {
  it("schreibt in den freien Pfad und gibt ihn zurück", async () => {
    const { app, written } = fakeApp();
    const path = await writeExport(app, "30_Health", "Ruhepuls 2026-07", "md", "inhalt");
    expect(path).toBe("30_Health/Ruhepuls 2026-07.md");
    expect(written).toEqual([["30_Health/Ruhepuls 2026-07.md", "inhalt"]]);
  });

  it("belegter Pfad → Suffix zählt hoch, bestehende Datei bleibt unangetastet", async () => {
    const { app, written } = fakeApp(["30_Health", "30_Health/A.md", "30_Health/A 2.md"]);
    const path = await writeExport(app, "30_Health", "A", "md", "neu");
    expect(path).toBe("30_Health/A 3.md");
    expect(written.map((w) => w[0])).toEqual(["30_Health/A 3.md"]);
  });

  it("fehlender Ordner wird angelegt", async () => {
    const { app, dirs } = fakeApp();
    await writeExport(app, "30_Health/Exporte", "A", "csv", "x");
    expect(dirs).toEqual(["30_Health/Exporte"]);
  });

  it("vorhandener Ordner wird nicht erneut angelegt", async () => {
    const { app, dirs } = fakeApp(["30_Health"]);
    await writeExport(app, "30_Health", "A", "csv", "x");
    expect(dirs).toEqual([]);
  });

  it("leerer Ordner bedeutet Vault-Wurzel, ohne mkdir", async () => {
    const { app, dirs, written } = fakeApp();
    const path = await writeExport(app, "", "A", "md", "x");
    expect(path).toBe("A.md");
    expect(dirs).toEqual([]);
    expect(written).toHaveLength(1);
  });

  it("Sonderzeichen im Basename werden gesäubert", async () => {
    const { app } = fakeApp();
    const path = await writeExport(app, "", "A/B", "md", "x");
    expect(path).toBe("AB.md");
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/obsidian/export-writer.test.ts`
Expected: FAIL — Modul nicht gefunden

- [ ] **Step 3: Implementieren**

`src/obsidian/export-writer.ts`:

```ts
import type { App } from "obsidian";
import { joinPath, sanitizeBase } from "../core/export-path";

/**
 * Schreibt den Export ins Vault und gibt den tatsächlich benutzten Pfad zurück.
 * Zählweise übernommen aus `obsidian-paperize/src/obsidian/output.ts`
 * (resolveVersionedOutputPath).
 *
 * Es wird NIE überschrieben: Ein Export ist eine Momentaufnahme, und ein zweiter
 * Export desselben Zeitraums darf den ersten nicht stillschweigend ersetzen.
 * Die Schleife terminiert, weil jeder Durchlauf einen anderen Namen erzeugt.
 */
export async function writeExport(
  app: App, folder: string, baseName: string, ext: string, content: string,
): Promise<string> {
  const adapter = app.vault.adapter;
  const dir = (folder || "").replace(/^\/+|\/+$/g, "");
  if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);

  const safe = sanitizeBase(baseName);
  let path = joinPath(dir, `${safe}.${ext}`);
  let n = 2;
  while (await adapter.exists(path)) {
    path = joinPath(dir, `${safe} ${n}.${ext}`);
    n++;
  }
  await adapter.write(path, content);
  return path;
}
```

- [ ] **Step 4: Tests laufen lassen**

Run: `npx vitest run tests/obsidian/export-writer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/obsidian/export-writer.ts tests/obsidian/export-writer.test.ts
git commit -m "feat(obsidian): Werte-Export ins Vault schreiben

Kollisionszählung statt Überschreiben, Zählweise aus paperize übernommen."
```

---

### Task 11: `chart-render` — Achsen-Layer und Wochenlinien

**Files:**
- Modify: `src/obsidian/chart-render.ts`
- Modify: `styles.css`
- Test: `tests/obsidian/chart-render.test.ts`

**Interfaces:**
- Consumes: `AxisVM` (Task 7), `ChartGeometry.weekMarks` (Task 3)
- Produces: `renderChart(parent: HTMLElement, geom: ChartGeometry, opts?: { axis?: AxisVM }): void` — **Signaturwechsel**: `opts.axis` ist nicht mehr `boolean`, sondern `AxisVM | undefined`

- [ ] **Step 1: Failing tests schreiben**

Ans Ende von `tests/obsidian/chart-render.test.ts` (die Datei bringt ihren eigenen Fake-Element-Helfer mit — nutze den vorhandenen):

```ts
describe("renderChart mit Achsen", () => {
  const geom = {
    kind: "bar" as const, width: 100, height: 50,
    polyline: "", band: "",
    bars: [{ x: 5, y: 10, w: 8, h: 30 }],
    yTicks: [{ y: 45, value: 0 }, { y: 25, value: 50 }, { y: 5, value: 100 }],
    xTicks: [{ i: 0, x: 10 }],
    weekMarks: [5, 55],
  };
  const axis = {
    x: [{ leftPct: 10, label: "28.07." }],
    y: [{ topPct: 90, label: "0" }, { topPct: 50, label: "50" }, { topPct: 10, label: "100" }],
  };

  it("ohne axis-Option: kein Label-DOM, Sparkline-Verhalten unverändert", () => {
    const el = fakeEl();
    renderChart(el, geom);
    expect(findByCls(el, "ah-axis-x")).toBeNull();
    expect(findByCls(el, "ah-axis-y")).toBeNull();
  });

  it("mit axis: y-Labels und x-Labels werden gerendert", () => {
    const el = fakeEl();
    renderChart(el, geom, { axis });
    const xRow = findByCls(el, "ah-axis-x");
    const yCol = findByCls(el, "ah-axis-y");
    expect(xRow).not.toBeNull();
    expect(yCol).not.toBeNull();
    expect(findText(el, "28.07.")).toBe(true);
    expect(findText(el, "100")).toBe(true);
  });

  it("mit axis: Wochenlinien werden als eigene SVG-Linien gezeichnet", () => {
    const el = fakeEl();
    renderChart(el, geom, { axis });
    const weekLines = collectByCls(el, "ah-chart-week");
    expect(weekLines).toHaveLength(2);
  });

  it("ohne axis: keine Wochenlinien, auch wenn die Geometrie welche trägt", () => {
    const el = fakeEl();
    renderChart(el, geom);
    expect(collectByCls(el, "ah-chart-week")).toHaveLength(0);
  });
});
```

Falls `findByCls` / `collectByCls` in der Datei noch nicht existieren, oben ergänzen:

```ts
function findByCls(el: any, cls: string): any {
  if (typeof el.cls === "string" && el.cls.split(/\s+/).includes(cls)) return el;
  for (const c of el.children ?? []) { const hit = findByCls(c, cls); if (hit) return hit; }
  return null;
}
function collectByCls(el: any, cls: string): any[] {
  const out: any[] = [];
  const walk = (n: any): void => {
    if (typeof n.cls === "string" && n.cls.split(/\s+/).includes(cls)) out.push(n);
    for (const c of n.children ?? []) walk(c);
  };
  walk(el);
  return out;
}
```

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/obsidian/chart-render.test.ts`
Expected: FAIL — `expected null not to be null` (kein `ah-axis-x` im DOM)

- [ ] **Step 3: Implementieren**

`src/obsidian/chart-render.ts` vollständig ersetzen:

```ts
import type { ChartGeometry } from "../core/chart-geometry";
import type { AxisVM } from "../core/view-model";

/**
 * Zeichnet das Chart. Ohne `opts.axis` entsteht exakt das bisherige DOM (ein
 * nacktes <svg>) — das ist der Sparkline-Pfad der Übersicht.
 *
 * Mit Achsendaten kommt ein Grid-Rahmen dazu:
 *
 *   ┌──────────┬──────────────┐
 *   │ y-Labels │  <svg>       │
 *   ├──────────┼──────────────┤
 *   │          │  x-Labels    │
 *   └──────────┴──────────────┘
 *
 * Die Labels sind bewusst HTML und kein SVG-<text>: Das SVG skaliert über
 * width:100%, eine Schriftgröße in viewBox-Einheiten schrumpfte in einer
 * schmalen Sidebar auf wenige Pixel. Als HTML tragen sie --font-ui-smaller
 * und bleiben in jeder Containerbreite lesbar.
 */
export function renderChart(parent: HTMLElement, geom: ChartGeometry, opts?: { axis?: AxisVM }): void {
  const axis = opts?.axis;
  const host = axis ? parent.createDiv({ cls: "ah-chart-frame" }) : parent;

  if (axis) {
    const yCol = host.createDiv({ cls: "ah-axis-y" });
    for (const tick of axis.y) {
      const label = yCol.createSpan({ cls: "ah-axis-label", text: tick.label });
      label.setCssStyles({ top: `${tick.topPct}%` });
    }
  }

  const svgHost = axis ? host.createDiv({ cls: "ah-chart-box" }) : host;
  const svg = svgHost.createSvg("svg", {
    cls: "ah-chart",
    attr: { viewBox: `0 0 ${geom.width} ${geom.height}`, preserveAspectRatio: "none" },
  });

  if (axis) {
    for (const tick of geom.yTicks) {
      svg.createSvg("line", {
        cls: "ah-chart-grid",
        attr: { x1: 0, y1: tick.y, x2: geom.width, y2: tick.y },
      });
    }
    // Wochenlinien kommen aus der Geometrie (viewBox-Einheiten), nicht aus dem
    // AxisVM — sie werden im SVG gezeichnet, nicht im HTML-Layer.
    for (const x of geom.weekMarks) {
      svg.createSvg("line", {
        cls: "ah-chart-week",
        attr: { x1: x, y1: 0, x2: x, y2: geom.height },
      });
    }
  }

  if (geom.band) {
    svg.createSvg("polygon", { cls: "ah-chart-band", attr: { points: geom.band } });
  }
  if (geom.polyline) {
    svg.createSvg("polyline", { cls: "ah-chart-line", attr: { points: geom.polyline, fill: "none" } });
  }
  for (const b of geom.bars) {
    svg.createSvg("rect", {
      cls: "ah-chart-bar",
      attr: { x: b.x, y: b.y, width: b.w, height: b.h },
    });
  }

  if (axis) {
    host.createDiv({ cls: "ah-axis-corner" });
    const xRow = host.createDiv({ cls: "ah-axis-x" });
    for (const tick of axis.x) {
      const label = xRow.createSpan({ cls: "ah-axis-label", text: tick.label });
      label.setCssStyles({ left: `${tick.leftPct}%` });
    }
  }
}
```

- [ ] **Step 4: Aufrufer in `detail.ts` anpassen**

`src/obsidian/tabs/detail.ts`, Zeile mit `renderChart(chartBox, vm.chart, { axis: true });` ersetzen:

```ts
    renderChart(chartBox, vm.chart, { axis: vm.axis });
```

- [ ] **Step 5: CSS ergänzen**

Ans Ende von `styles.css`:

```css
/* --- Chart-Achsen (Slice 3c) --- */
.ah-chart-frame {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: var(--size-4-2);
}
.ah-axis-y { position: relative; width: 4ch; }
.ah-axis-x { position: relative; height: 1.6em; }
.ah-axis-label {
  position: absolute;
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  white-space: nowrap;
}
.ah-axis-y .ah-axis-label { right: 0; transform: translateY(-50%); }
.ah-axis-x .ah-axis-label { transform: translateX(-50%); }
.ah-chart-week { stroke: var(--background-modifier-border); stroke-width: 1; opacity: 0.5; }
```

- [ ] **Step 6: Tests, Typecheck, Lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: alles grün. Die bestehenden `detail`- und `overview`-Tests müssen weiterhin bestehen — die Übersicht ruft `renderChart` ohne `opts` auf.

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/chart-render.ts src/obsidian/tabs/detail.ts styles.css tests/obsidian/chart-render.test.ts
git commit -m "feat(obsidian): Achsen-Beschriftung und Wochenlinien im Detail-Chart

Labels als HTML statt SVG-Text: eine Schriftgröße in viewBox-Einheiten
schrumpft in schmalen Sidebars auf wenige Pixel."
```

---

### Task 12: Plugin-Daten und Host-Schnittstelle

**Files:**
- Modify: `src/main.ts`
- Modify: `src/obsidian/dashboard-view.ts`
- Test: `tests/obsidian/main-host.test.ts`

**Interfaces:**
- Consumes: `CollapsibleStorage` (Task 8)
- Produces:
  - `type ExportFormat = "md" | "csv"` (exportiert aus `src/obsidian/dashboard-view.ts`)
  - `DashboardHost` zusätzlich: `getExportFolder(): string`, `setExportFolder(v: string): void`, `getExportFormat(): ExportFormat`, `setExportFormat(f: ExportFormat): void`, `getCollapsed(key: string): boolean | undefined`, `setCollapsed(key: string, collapsed: boolean): void`
  - `renderDetail(el, cache, state, onState, view: DashboardView)` — der Detail-Tab bekommt die View (wie `renderOverview` schon)

- [ ] **Step 1: Failing tests schreiben**

Ans Ende von `tests/obsidian/main-host.test.ts`:

```ts
describe("Export-Einstellungen im Plugin-Data", () => {
  it("Defaults: leerer Ordner, Markdown, nichts eingeklappt gespeichert", async () => {
    const plugin = makePlugin();           // vorhandener Helfer der Datei
    await plugin.loadPluginData();
    expect(plugin.getExportFolder()).toBe("");
    expect(plugin.getExportFormat()).toBe("md");
    expect(plugin.getCollapsed("detail-values")).toBeUndefined();
  });

  it("Setzen persistiert über saveData", async () => {
    const plugin = makePlugin();
    await plugin.loadPluginData();
    plugin.setExportFolder("30_Health");
    plugin.setExportFormat("csv");
    plugin.setCollapsed("detail-values", false);
    expect(plugin.getExportFolder()).toBe("30_Health");
    expect(plugin.getExportFormat()).toBe("csv");
    expect(plugin.getCollapsed("detail-values")).toBe(false);
  });

  it("Altes data.json ohne die neuen Felder lädt ohne Absturz", async () => {
    const plugin = makePlugin();
    plugin.loadData = async () => ({ favorites: ["a"] });
    await plugin.loadPluginData();
    expect(plugin.getFavorites()).toEqual(["a"]);
    expect(plugin.getExportFolder()).toBe("");
    expect(plugin.getExportFormat()).toBe("md");
  });
});
```

Falls die Datei keinen `makePlugin`-Helfer hat, lies nach, wie sie die Plugin-Instanz baut, und folge demselben Muster.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/obsidian/main-host.test.ts`
Expected: FAIL — `plugin.getExportFolder is not a function`

- [ ] **Step 3: `DashboardHost` erweitern**

In `src/obsidian/dashboard-view.ts`:

```ts
export type ExportFormat = "md" | "csv";

export interface DashboardHost {
  loadCache(): Promise<HealthCache | null>;
  getFavorites(): string[];
  toggleFavorite(id: string): Promise<void>;
  createImportController(onState: (s: ImportState) => void): ImportController;
  pickExport(): Promise<File | null>;
  getExportFolder(): string;
  setExportFolder(v: string): void;
  getExportFormat(): ExportFormat;
  setExportFormat(f: ExportFormat): void;
  /** Erfüllt zugleich das CollapsibleStorage-Interface des Kit-Moduls. */
  getCollapsed(key: string): boolean | undefined;
  setCollapsed(key: string, collapsed: boolean): void;
}
```

Und den Detail-Aufruf in `renderActive()` um die View erweitern:

```ts
    } else if (this.active === "detail") {
      renderDetail(panel, this.cache, this.detail, (s) => { this.detail = s; this.renderActive(); }, this);
    } else {
```

- [ ] **Step 4: `main.ts` erweitern**

```ts
import type { ExportFormat } from "./obsidian/dashboard-view";

interface PluginData {
  favorites: string[];
  exportFolder: string;
  exportFormat: ExportFormat;
  collapsed: Record<string, boolean>;
}
const DEFAULT_DATA: PluginData = {
  favorites: [], exportFolder: "", exportFormat: "md", collapsed: {},
};
```

Und die Host-Methoden neben `toggleFavorite` einfügen:

```ts
  getExportFolder(): string { return this.data.exportFolder; }
  setExportFolder(v: string): void {
    this.data.exportFolder = v;
    void this.saveData(this.data);
  }

  getExportFormat(): ExportFormat { return this.data.exportFormat; }
  setExportFormat(f: ExportFormat): void {
    this.data.exportFormat = f;
    void this.saveData(this.data);
  }

  // Signatur von CollapsibleStorage vorgegeben: synchron, kein Promise. Das
  // Schreiben läuft deshalb bewusst als void-Aufruf nebenher — geht es schief,
  // ist die Folge ein nicht gemerkter Aufklappzustand, kein Datenverlust.
  getCollapsed(key: string): boolean | undefined { return this.data.collapsed[key]; }
  setCollapsed(key: string, collapsed: boolean): void {
    this.data.collapsed[key] = collapsed;
    void this.saveData(this.data);
  }
```

`loadPluginData` bleibt unverändert — das vorhandene `{ ...DEFAULT_DATA, ...(loaded ?? {}) }` füllt fehlende Felder alter `data.json`-Dateien automatisch auf.

- [ ] **Step 5: Bestandstests auf die neue Signatur heben**

`renderDetail` hat jetzt einen fünften Parameter — die vorhandenen Aufrufe in `tests/obsidian/detail.test.ts` rufen noch viergargumentig und brechen den Typecheck. Ergänze in der Datei einen View-Stub und gib ihn **allen** bestehenden `renderDetail`-Aufrufen als fünftes Argument mit:

```ts
function fakeView(): any {
  const store: Record<string, boolean> = {};
  return {
    app: {},
    host: {
      getExportFolder: () => "",
      setExportFolder: () => {},
      getExportFormat: () => "md",
      setExportFormat: () => {},
      getCollapsed: (k: string) => store[k],
      setCollapsed: (k: string, c: boolean) => { store[k] = c; },
    },
  };
}
```

Erweitere im selben Zug den `fakeEl()`-Helfer der Datei um die Methode, die der Achsen-Layer aufruft:

```ts
    setCssStyles(_s: any) {},
```

- [ ] **Step 6: Tests und Typecheck**

Run: `npm test && npm run typecheck`
Expected: **beides grün.** Die Task hinterlässt keinen roten Zwischenstand — das ist der Grund, warum die Test-Anpassung hier und nicht in Task 13 steht.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src/obsidian/dashboard-view.ts tests/obsidian/main-host.test.ts tests/obsidian/detail.test.ts
git commit -m "feat(obsidian): Export-Ordner, -Format und Aufklappzustand in data.json

DashboardHost erfüllt zugleich das CollapsibleStorage-Interface des Kit-Moduls."
```

---

### Task 13: Detail-Tab — Aufklapp-Sektion mit Werte-Tabelle

**Files:**
- Modify: `src/obsidian/tabs/detail.ts`
- Modify: `styles.css`
- Test: `tests/obsidian/detail.test.ts`

**Interfaces:**
- Consumes: `collapsibleSection` (Task 8), `DetailVM.table` (Task 7), `DashboardHost` (Task 12)
- Produces: `renderDetail(el, cache, state, onState, view: DashboardView): void` — fünfter Parameter neu

- [ ] **Step 1: Voraussetzung prüfen**

Der View-Stub `fakeView()` und die `setCssStyles`-Ergänzung in `fakeEl()` stammen aus Task 12 und liegen bereits in `tests/obsidian/detail.test.ts`. Vergewissere dich davon (`npm test`), bevor du weiterschreibst — die folgenden Tests bauen darauf auf.

- [ ] **Step 2: Failing tests für die Tabelle schreiben**

```ts
describe("renderDetail — Werte-Tabelle", () => {
  it("mit Daten: Sektion mit Titel und Zeilenzahl", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    expect(findText(el, "Werte")).toBe(true);
  });

  it("Tabelle trägt Kopfzeile und eine Zeile je Punkt", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    expect(findText(el, "Datum")).toBe(true);
    expect(findText(el, "2026-01")).toBe(true); // Monatsschlüssel bei range "all"
  });

  it("ohne Daten im Zeitraum: keine Sektion", () => {
    const leer: HealthCache = { ...cache, dateRange: { from: "2020-01-01", to: "2020-01-02" } };
    const el = fakeEl();
    renderDetail(el, leer, { metricId: "HKQuantityTypeIdentifierStepCount", range: "1M" }, () => {}, fakeView());
    expect(findText(el, "Werte")).toBe(false);
  });
});
```

- [ ] **Step 3: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/obsidian/detail.test.ts`
Expected: FAIL — `expected false to be true` (keine Sektion im DOM)

- [ ] **Step 4: Implementieren**

`src/obsidian/tabs/detail.ts` — Importe und Signatur:

```ts
import type { HealthCache } from "../../core/types";
import type { RangeKey } from "../../core/rollup";
import type { TableVM } from "../../core/view-model";
import { buildDetailVM } from "../../core/view-model";
import { renderChart } from "../chart-render";
import type { DashboardView } from "../dashboard-view";
import { collapsibleSection } from "../../vendor/kit-obsidian/collapsible";
import { t } from "../../vendor/kit/i18n";

export interface DetailState { metricId: string | null; range: RangeKey; }

const RANGES: RangeKey[] = ["1M", "3M", "1Y", "all"];
const CHART_DIMS = { width: 640, height: 260, padding: 24 };
const VALUES_KEY = "detail-values";

export function renderDetail(
  el: HTMLElement, cache: HealthCache, state: DetailState,
  onState: (s: DetailState) => void, view: DashboardView,
): void {
```

Am Ende der Funktion, nach der Statistik-Zeile:

```ts
  // Kein Export von nichts: ohne Punkte im Zeitraum entfällt die Sektion ganz.
  if (!vm.empty) renderValuesSection(el, vm.table, view);
}

function renderValuesSection(el: HTMLElement, table: TableVM, view: DashboardView): void {
  const body = collapsibleSection(el, {
    title: `${t("table.title")} (${table.rows.length})`,
    key: VALUES_KEY,
    defaultCollapsed: true,
    storage: view.host,
  });
  renderValuesTable(body, table);
}

function renderValuesTable(parent: HTMLElement, table: TableVM): void {
  const wrap = parent.createDiv({ cls: "ah-table-wrap" });
  const el = wrap.createEl("table", { cls: "ah-table" });
  const headRow = el.createEl("thead").createEl("tr");
  for (const h of table.headers) headRow.createEl("th", { text: h });
  const tbody = el.createEl("tbody");
  for (const row of table.rows) {
    const tr = tbody.createEl("tr");
    for (const cell of row) tr.createEl("td", { text: cell });
  }
}
```

- [ ] **Step 5: CSS ergänzen**

Ans Ende von `styles.css` — zuerst das Kit-Snippet (Inhalt von `COLLAPSIBLE_CSS` aus `src/vendor/kit-obsidian/collapsible.ts` **verbatim** kopieren), danach:

```css
/* --- Werte-Tabelle (Slice 3c) --- */
.ah-table-wrap { max-height: 22em; overflow: auto; }
.ah-table { width: 100%; border-collapse: collapse; font-size: var(--font-ui-small); }
.ah-table th, .ah-table td {
  text-align: left;
  padding: var(--size-4-1) var(--size-4-2);
  border-bottom: 1px solid var(--background-modifier-border);
}
.ah-table th { color: var(--text-muted); font-weight: var(--font-semibold); position: sticky; top: 0; background: var(--background-primary); }
.ah-table tr:hover td { background: var(--background-modifier-hover); }
```

- [ ] **Step 6: Tests, Typecheck, Lint**

Run: `npm test && npm run typecheck && npm run lint`
Expected: alles grün

- [ ] **Step 7: Commit**

```bash
git add src/obsidian/tabs/detail.ts styles.css tests/obsidian/detail.test.ts
git commit -m "feat(obsidian): aufklappbare Werte-Tabelle unter dem Detail-Chart

Aufklappzustand über CollapsibleStorage in data.json — der Detail-Tab
rendert bei jedem Range-Wechsel neu, ein DOM-Zustand wäre danach weg."
```

---

### Task 14: Detail-Tab — Export-Zeile

**Files:**
- Modify: `src/obsidian/tabs/detail.ts`
- Modify: `styles.css`
- Test: `tests/obsidian/detail.test.ts`

**Interfaces:**
- Consumes: `toMarkdownTable`/`toCsv` (Task 5), `buildExportName` (Task 6), `copyToClipboard` (Task 9), `writeExport` (Task 10), `FolderSuggest` (Task 8), `DashboardHost`-Getter/Setter (Task 12)
- Produces: nichts für spätere Tasks

- [ ] **Step 1: Failing tests schreiben**

```ts
describe("renderDetail — Export-Zeile", () => {
  it("Buttons, Format-Umschalter und Ordner-Feld sind da", () => {
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    expect(findText(el, "Kopieren")).toBe(true);
    expect(findText(el, "Speichern")).toBe(true);
    expect(findText(el, "MD")).toBe(true);
    expect(findText(el, "CSV")).toBe(true);
    expect(findText(el, "Ordner")).toBe(true);
  });

  it("Klick auf CSV meldet das Format an den Host", () => {
    const view = fakeView();
    const seen: string[] = [];
    view.host.setExportFormat = (f: string) => seen.push(f);
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, view);
    findByText(el, "CSV")._click();
    expect(seen).toEqual(["csv"]);
  });

  it("Kopieren schreibt die Markdown-Tabelle in die Zwischenablage", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, fakeView());
    findByText(el, "Kopieren")._click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("| Datum |");
    vi.unstubAllGlobals();
  });

  it("bei CSV-Format kopiert derselbe Button eine CSV", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const view = fakeView();
    view.host.getExportFormat = () => "csv";
    const el = fakeEl();
    renderDetail(el, cache, { metricId: "HKQuantityTypeIdentifierStepCount", range: "all" }, () => {}, view);
    findByText(el, "Kopieren")._click();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).not.toContain("|");
    expect(writeText.mock.calls[0][0]).toContain(",");
    vi.unstubAllGlobals();
  });
});
```

Der Fake-Element-Helfer der Datei speichert nur den zuletzt registrierten Handler in `_click`. Prüfe, ob `findByText` den Button (nicht sein Textkind) liefert — falls die Handler nicht greifen, erweitere `fakeEl()` so, dass `createEl("button", { text })` den Text am Element selbst ablegt.

- [ ] **Step 2: Tests laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/obsidian/detail.test.ts`
Expected: FAIL — `expected false to be true` (kein „Kopieren" im DOM)

- [ ] **Step 3: Implementieren**

In `src/obsidian/tabs/detail.ts` die Importe ergänzen:

```ts
import { Notice } from "obsidian";
import { toCsv, toMarkdownTable } from "../../core/serialize";
import { buildExportName } from "../../core/export-path";
import { copyToClipboard } from "../clipboard";
import { writeExport } from "../export-writer";
import { FolderSuggest } from "../../vendor/kit-obsidian/folder-suggest";
import type { ExportFormat } from "../dashboard-view";
```

`renderValuesSection` um die Export-Zeile erweitern — sie steht **über** der Tabelle:

```ts
function renderValuesSection(el: HTMLElement, vm: DetailVM, view: DashboardView): void {
  const body = collapsibleSection(el, {
    title: `${t("table.title")} (${vm.table.rows.length})`,
    key: VALUES_KEY,
    defaultCollapsed: true,
    storage: view.host,
  });
  renderExportRow(body, vm, view);
  renderValuesTable(body, vm.table);
}
```

Der Aufruf im Hauptteil ändert sich entsprechend zu `renderValuesSection(el, vm, view)`.

```ts
const FORMATS: Array<{ id: ExportFormat; label: string }> = [
  { id: "md", label: "MD" },
  { id: "csv", label: "CSV" },
];

function serializeTable(vm: DetailVM, format: ExportFormat): string {
  return format === "csv"
    ? toCsv(vm.table.headers, vm.table.rowsRaw)
    : toMarkdownTable(vm.table.headers, vm.table.rows);
}

function renderExportRow(parent: HTMLElement, vm: DetailVM, view: DashboardView): void {
  const host = view.host;
  const row = parent.createDiv({ cls: "ah-export-row" });

  const copyBtn = row.createEl("button", { cls: "mod-cta", text: t("export.copy") });
  copyBtn.addEventListener("click", () => {
    const text = serializeTable(vm, host.getExportFormat());
    copyToClipboard(text, () => {
      new Notice(t("export.copied", String(vm.table.rows.length)));
    });
  });

  const saveBtn = row.createEl("button", { text: t("export.save") });
  saveBtn.addEventListener("click", () => { void save(); });

  const formatBar = row.createDiv({ cls: "ah-range-bar" });
  for (const f of FORMATS) {
    const btn = formatBar.createEl("button", { text: f.label });
    btn.addClass("ah-range-btn");
    if (f.id === host.getExportFormat()) btn.addClass("is-active");
    btn.addEventListener("click", () => {
      host.setExportFormat(f.id);
      // Nur die Markierung umhängen statt neu zu rendern: ein Re-Render würde
      // den Fokus aus dem Ordner-Feld reißen, während man noch tippt.
      for (const el of Array.from(formatBar.children)) el.removeClass("is-active");
      btn.addClass("is-active");
    });
  }

  const folderRow = parent.createDiv({ cls: "ah-export-folder" });
  folderRow.createSpan({ cls: "ah-export-label", text: t("export.folder") });
  const input = folderRow.createEl("input", { attr: { type: "text", placeholder: "/" } });
  input.value = host.getExportFolder();
  new FolderSuggest(view.app, input);
  // Der Suggest feuert nach der Klick-Auswahl selbst ein "input"-Event —
  // deshalb genügt dieser eine Listener für Tippen UND Auswählen.
  input.addEventListener("input", () => { host.setExportFolder(input.value); });

  async function save(): Promise<void> {
    const format = host.getExportFormat();
    const from = vm.table.rows[0]?.[0] ?? "";
    const to = vm.table.rows[vm.table.rows.length - 1]?.[0] ?? "";
    try {
      const path = await writeExport(
        view.app, host.getExportFolder(), buildExportName(vm.name, from, to),
        format, serializeTable(vm, format),
      );
      new Notice(t("export.saved", path));
    } catch (err) {
      new Notice(t("export.saveFailed", err instanceof Error ? err.message : String(err)));
    }
  }
}
```

- [ ] **Step 4: CSS ergänzen**

Ans Ende von `styles.css`:

```css
/* --- Export-Zeile (Slice 3c) --- */
.ah-export-row {
  display: flex; align-items: center; gap: var(--size-4-2);
  flex-wrap: wrap; margin-bottom: var(--size-4-2);
}
.ah-export-folder {
  display: flex; align-items: center; gap: var(--size-4-2);
  margin-bottom: var(--size-4-2);
}
.ah-export-folder input { flex: 1; min-width: 12ch; }
.ah-export-label { color: var(--text-muted); font-size: var(--font-ui-small); }
```

- [ ] **Step 5: Tests, Typecheck, Lint, Build**

Run: `npm test && npm run typecheck && npm run lint && npm run build`
Expected: alles grün, `main.js` entsteht

- [ ] **Step 6: Commit**

```bash
git add src/obsidian/tabs/detail.ts styles.css tests/obsidian/detail.test.ts
git commit -m "feat(obsidian): Export der Werte-Tabelle als Markdown oder CSV

Zwischenablage oder Vault-Datei; Ordner mit FolderSuggest, in data.json
gemerkt. Nie überschreiben — der Schreiber zählt ein Suffix hoch."
```

---

### Task 15: Abschluss — Doku, Registry, Handover

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `../REGISTRY.md`

**Interfaces:**
- Consumes: alles Vorherige
- Produces: nichts

- [ ] **Step 1: CHANGELOG ergänzen**

Unter `## [Unreleased]` in `CHANGELOG.md`. **Nicht** datieren und **keine** Versionsnummer setzen — `npm run release` datiert den Block selbst (Lesson obsidian-transmute 2026-07-26):

```markdown
### Added
- Detail-Chart: Achsenbeschriftung (Datum, Kalenderwoche oder Monat je Zeitraum) und
  Werte an den Gitterlinien.
- Detail-Chart: Wochenanfänge sind bei Tagesauflösung markiert.
- Detail-Ansicht: aufklappbare Werte-Tabelle unter dem Chart.
- Werte-Export als Markdown-Tabelle oder CSV — in die Zwischenablage oder als Datei
  ins Vault, mit Ordnerauswahl. Bestehende Dateien werden nie überschrieben.
```

- [ ] **Step 2: REGISTRY-Nachträge im Dach**

In `/Users/Shared/code/obsidian-plugins/REGISTRY.md`:

1. **`copyToClipboard`** erreicht mit diesem Plugin n=3 (json_viewer, kuro-gamification, health-vitals) → Status auf **Kit-Kandidat** heben, Fundstellen ergänzen. Nicht-offensichtliches Detail mitschreiben: Der `navigator.clipboard`-Guard muss vor dem Zugriff stehen, weil das Property-Lesen in non-secure Contexts synchron wirft.
2. **Versionierte Pfadauflösung** (paperize, epub-exporter, health-vitals) erreicht n=3 → **Kit-Kandidat**.
3. **CSV-Serialisierung** ist das erste Exemplar im Ökosystem → neuer Katalogeintrag (Wissen ab n=1) mit Fundstelle `apple-health/src/core/serialize.ts`.
4. Beim **Chart-Eintrag** (Z. 130) ergänzen, dass Achsen-Labels als HTML-Layer neben dem SVG liegen und warum — SVG-`<text>` koppelt die Schriftgröße an die Containerbreite.

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): Slice 3c — Achsen, Werte-Tabelle, Export"
```

Der REGISTRY-Commit läuft im Dach-Repo:

```bash
cd /Users/Shared/code/obsidian-plugins
git add REGISTRY.md
git commit -m "docs(registry): Clipboard + versionierte Pfadauflösung auf n=3, CSV-Serialisierung neu"
cd apple-health
```

- [ ] **Step 4: Smoke-Test-Handover schreiben**

Node-Tests können die Naht zum Host nicht prüfen. Lege eine Handover-Note im Cockpit an (`10_Pallas/25_Coding/apple-health/📋 Handover — Slice 3c Smoke-Test.md`) mit diesen abhakbaren Punkten:

1. Achsen in allen vier Zeiträumen, in **de und en**.
2. **Sidebar schmal gegen Editor-Tab breit** — der Fall, für den die HTML-Labels gewählt wurden: Beschriftung muss in beiden Breiten lesbar bleiben.
3. Montagslinien bei 1M und 3M vorhanden, bei 1J und „Alles" abwesend.
4. Kopieren → in eine Notiz einfügen, als MD und als CSV. Deutsche Zahlen dürfen die CSV nicht zerlegen.
5. Speichern → Ordner-Autocomplete tippen **und** klicken (der Klick-Pfad ist der, der ohne `dispatchEvent` still nichts speichert); Datei landet im gewählten Ordner; zweiter Export erzeugt ` 2`.
6. Aufklappzustand übersteht Range-Wechsel **und** Obsidian-Neustart.
7. Übersicht und Sparklines unverändert.

---

## Self-Review

**Spec-Abdeckung:** Achsen-Geometrie → Task 3. Label-Formate inkl. UTC → Task 4. Montags-Betonung → Task 3 (Geometrie) + 11 (Rendering). y-Werte → Task 7 (VM) + 11 (DOM). Serialisierung → Task 5. Pfadbau → Task 6. Tabellenmodell inkl. zweier Zeilensätze → Task 7. Vendoring nach §9 → Task 8. Clipboard → Task 9. Vault-Schreiben mit Kollisionszählung → Task 10. Grid-Layout und HTML-Labels → Task 11. `PluginData`/`CollapsibleStorage` → Task 12. Aufklapp-Sektion und Tabelle → Task 13. Export-Zeile mit Buttons, Format-Umschalter, Ordner-Feld → Task 14. Fehlerbehandlung → Tasks 9, 10, 14. i18n → Task 2. CSS → Tasks 11, 13, 14. Zeitzonen-Härtung → Task 1. Registry-Nachträge → Task 15. **Keine Lücke.**

**Typkonsistenz:** `AxisVM`/`TableVM` werden in Task 7 definiert und in 11/13/14 unter denselben Namen konsumiert. `buildChartGeometry`s vierter Parameter heißt durchgehend `opts` mit Feld `granularity`. `writeExport` hat in Task 10 und 14 dieselbe fünfstellige Signatur. `ExportFormat` wird in Task 12 exportiert und in 14 importiert. `buildExportName` ist überall dreiargumentig (ohne Endung) — **abweichend von der Spec**, die vier Parameter nennt; die Spec wird entsprechend präzisiert, weil das Kollisions-Suffix vor die Endung muss.

**Reihenfolge-Abhängigkeiten:** Task 2 (i18n) vor 4, 7, 13, 14. Task 3 vor 7 und 11. Task 7 vor 11, 13, 14. Task 12 vor 13 und 14. Task 8 vor 13 (collapsible) und 14 (FolderSuggest). **Jede Task hinterlässt einen grünen Typecheck** — der Signaturwechsel an `renderDetail` und die Anpassung seiner Bestandstests liegen beide in Task 12.
