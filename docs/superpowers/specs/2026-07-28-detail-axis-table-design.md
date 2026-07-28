# Slice 3c — Achsen-Beschriftung + Werte-Tabelle mit Export

**Datum:** 2026-07-28
**Plugin:** Health Vitals (Repo `apple-health`)
**Status:** Design bestätigt, bereit für Plan

## Ziel

Zwei Befunde aus dem Slice-2-Smoke-Test schließen:

1. Das Detail-Chart zeigt eine Form, aber keine Größenordnung und keinen Zeitbezug — es
   fehlen Achsen-Labels (x: Datum/KW/Monat, y: Werte an den Gitterlinien) und bei
   Tagesauflösung eine Wochenanfangs-Markierung.
2. Die Zahlen hinter dem Chart sind nicht erreichbar. **Primärzweck laut Nutzer-Entscheidung:
   Daten rausholen und weiterverwenden** — die sichtbare Tabelle ist Kontrolle vor dem Export,
   nicht das Hauptwerkzeug.

Umfang bleibt auf die Detail-Ansicht begrenzt. Übersicht, Sparklines, Workouts und der
Import-Pfad werden nicht angefasst.

## Leitentscheidung: Kanon vor Neubau (PROF-OBS-07)

Die Sondierung über Dach, Kit und Nachbar-Plugins ergab, dass der **gesamte Export-Strang
bereits gelöst ist**. Übernommen wird:

| Baustein | Quelle | Was daran nicht offensichtlich ist |
|---|---|---|
| `copyToClipboard(text, onCopied?)` | `json_viewer/src/obsidian/clipboard.ts` | `navigator.clipboard` muss **vor** dem Zugriff geprüft werden — in non-secure Contexts wirft schon das Property-Lesen synchron |
| ~~Kopier-Feedback am Button („✓", 800 ms)~~ **nicht umgesetzt** — siehe Nachtrag unten | `json_viewer/src/obsidian/CopyButton.ts` | `window.setTimeout`, nicht `activeWindow` (`obsidianmd/prefer-window-timers`) |
| `renderTable` / `escapeCell` | `vault-rag/src/reformat_mechanical.ts` | Ein literales `\|` in einer Zelle muss re-escaped werden, sonst zerfällt die Zelle in zwei |
| `sanitizeBase`, `joinPath`, versionierte Pfadauflösung | `obsidian-paperize/src/obsidian/output.ts`, byte-nah in `epub-exporter/src/core/output-path.ts` | Die `exists`-Schleife braucht einen Abbruchgrund, sonst läuft sie endlos, wenn sich der Name nie ändert |
| `collapsibleSection` + `CollapsibleStorage` | `obsidian-kit/src/obsidian/collapsible.ts` | Persistenz-Callback und a11y (`role=button`, `aria-expanded`, Enter/Space) sind enthalten |
| `FolderSuggest` | `kuro-gamification/src/vendor/kit/folder-suggest.ts` (Ursprung `vault-rag` → `local-image-generator`) | `dispatchEvent(new Event("input"))` nach der Klick-Auswahl — fehlt es, wird der gewählte Ordner nie gespeichert; `slice(0, 20)` deckelt die Liste in großen Vaults |

**Echter Neubau** ist nur: die Achsen-Geometrie (dieses Repo ist beim Charting selbst das
erste Exemplar im Ökosystem, REGISTRY Z. 130) und die CSV-Serialisierung (im Ökosystem
nirgends vorhanden).

**Ablage der vendorten Kit-Module** nach UI-STANDARD §9: beide importieren `obsidian`, also
`src/vendor/kit-obsidian/`. `folder-suggest.ts` liegt in kuro-gamification noch unter
`vendor/kit/` — wir legen es bei uns korrekt ab und erben den Fehler nicht.

## Architektur

### 1. Pure Kern

**`src/core/chart-geometry.ts` (erweitert).** `ChartGeometry` bekommt zwei Felder:

```ts
xTicks: Array<{ i: number; x: number }>;  // welcher Punkt, an welcher x-Position
weekMarks: number[];                      // x-Positionen der Wochenanfänge
```

Beide Felder tragen **nur Zahlen, keine Texte** — den Schlüssel holt sich das View-Model über
`i` aus den Punkten, die es ohnehin in der Hand hat. Die Geometrie bleibt damit frei von
Locale- und Anzeigefragen.

Signatur wird um einen optionalen vierten Parameter erweitert:
`buildChartGeometry(points, kind, dims, opts?: { granularity?: Granularity })`.
**Ohne** `opts` (Sparkline-Aufruf aus `tileFor`) bleiben beide Felder leer und das Verhalten
identisch — das ist die Bedingung dafür, dass die Übersicht von diesem Slice unberührt bleibt.

- **Tick-Auswahl:** Zielzahl `AXIS_TICKS = 5`, `step = max(1, ceil(n / AXIS_TICKS))`, Indizes
  `0, step, 2·step, …`. **Kein Sonderfall für den letzten Punkt** — der Zeitraum steht bereits
  als „von – bis" im Kopf der Detail-Ansicht; ein Endlabel wäre Dopplung und zugleich die
  häufigste Kollisionsquelle mit dem vorletzten Tick.
- **`weekMarks`:** nur bei `granularity === "day"`, sonst leer. Ein Punkt zählt als
  Wochenanfang, wenn sein Datum ein Montag ist. Die x-Position ist der **Anfang des Slots**
  (`padding + i·slotW` bei `kind === "bar"`, sonst `scaleX(i)`) — nicht die Balkenmitte, sonst
  markiert die Linie den Montag statt ihn abzugrenzen.
- Bestehende Edge-Cases (`points.length === 0`, `n === 1`, `lo === hi`) gelten unverändert und
  müssen auch für die neuen Felder halten.

**`src/core/format.ts` (erweitert).** `formatTickLabel(key: string, g: Granularity): string`:

| Granularität | Key | de | en |
|---|---|---|---|
| `day` | `2026-07-28` | `28.07.` | `07/28` |
| `week` | `2026-W30` | `KW 30` | `W 30` |
| `month` | `2026-07` | `Jul 26` | `Jul 26` |

Tag und Monat über `toLocaleDateString(localeTag(), …)`. **Verbindlich: mit
`timeZone: "UTC"`.** Die Keys stehen für UTC-Mitternacht; ohne die Option verschiebt jede
Zeitzone westlich von Greenwich jedes Label um einen Tag nach hinten. Die Kalenderwoche wird
aus dem Key gelesen, nicht neu berechnet (`isoWeekKey` in `rollup.ts` hat sie bereits erzeugt).

**`src/core/serialize.ts` (neu).**

```ts
toMarkdownTable(headers: string[], rows: string[][]): string
toCsv(headers: string[], rows: string[][]): string
```

Markdown-Teil aus `vault-rag` übernommen, inklusive `escapeCell`. CSV mit Komma-Delimiter und
**Quoting-Regeln nach RFC 4180**: Anführungszeichen genau dann, wenn die Zelle Komma,
Anführungszeichen oder Zeilenumbruch enthält; enthaltene Anführungszeichen werden verdoppelt.
Als Zeilenende `\n` statt des von RFC 4180 verlangten `\r\n` — Ziel ist ein Obsidian-Vault,
und jede gängige Tabellenkalkulation liest beides.

**`src/core/export-path.ts` (neu).** `sanitizeBase(name)`, `joinPath(dir, file)`,
`buildExportName(metricName, from, to)` → `Ruhepuls 2026-06-28–2026-07-28` (Basename **ohne**
Endung — das Kollisions-Suffix muss zwischen Name und Endung, deshalb hängt `writeExport` sie
selbst an). `from`/`to`
sind die Schlüssel des ersten und letzten Punkts — dieselbe Quelle, aus der schon der
`rangeLabel` im Kopf der Ansicht gebaut wird, nicht die angeforderten Range-Grenzen. Der Name
beschreibt damit die tatsächlich enthaltenen Daten. Aus paperize/epub-exporter übernommen; die
Kollisionszählung selbst lebt in der Obsidian-Schicht, weil sie `exists` awaiten muss.

**`src/core/view-model.ts` (erweitert).** `DetailVM` bekommt zwei Felder:

```ts
axis: {
  x: Array<{ leftPct: number; label: string }>;
  y: Array<{ topPct: number; label: string }>;
};
table: {
  headers: string[];
  rows: string[][];      // formatiert — Anzeige und Markdown
  rowsRaw: string[][];   // rohe Zahlen — CSV
};
```

Die Prozentwerte entstehen hier (`x / dims.width * 100`, `y / dims.height * 100`), damit die
Obsidian-Schicht keine Koordinatenrechnung enthält. **Die Wochenlinien bleiben bewusst
außen vor:** sie werden als `<line>` *im* SVG gezeichnet und brauchen deshalb
viewBox-Einheiten — `renderChart` liest sie direkt aus `geom.weekMarks`. Eine Prozent-Variante
im View-Model wäre ein zweiter, nie benutzter Zahlenweg.

**Spalten je Policy:**

| Policy | Spalten |
|---|---|
| `measure` | Datum · Ø (Einheit) · Min (Einheit) · Max (Einheit) |
| `sum`, `duration` | Datum · Wert (Einheit) |

Zwei bewusste Festlegungen:

- **Die Einheit steht im Spaltenkopf, nie in der Zelle.** Sonst wiederholt sie sich
  hundertfach und macht die Werte für Weiterverarbeitung unbrauchbar.
- **Die Datumsspalte trägt den rohen Schlüssel** (`2026-07-28`, `2026-W30`, `2026-07`), nicht
  das gekürzte Achsenformat: eindeutig, sortierbar, maschinenlesbar. Der Spaltenkopf heißt je
  nach Granularität Datum / Woche / Monat.

**Warum zwei Zeilensätze:** `formatValue` liefert locale-formatierte Zahlen — auf Deutsch
`1.234,5`. In einer Komma-getrennten CSV zerlegt das die Zelle, und selbst mit Quoting liest
eine Tabellenkalkulation den Wert je nach Locale als Text. Markdown und Anzeige bekommen
deshalb die formatierten Werte, CSV die rohen mit Punkt-Dezimaltrenner. Ein Format, das beiden
Zwecken passt, gibt es nicht.

### 2. Obsidian-Schicht

**`src/obsidian/clipboard.ts` (neu, übernommen).** `copyToClipboard(text, onCopied?)` mit dem
Guard und Fehler-Notice. Kein zusätzlicher Wrapper.

**`src/obsidian/export-writer.ts` (neu).**

```ts
writeExport(app: App, folder: string, baseName: string, ext: string, content: string): Promise<string>
```

Legt den Ordner per `mkdir` an, falls er fehlt. Zählt ein numerisches Suffix hoch (` 2`, ` 3`
…), solange `adapter.exists` den Pfad meldet — **überschrieben wird nie**. Gibt den
geschriebenen Pfad zurück; der Aufrufer zeigt die Notice.

**`src/obsidian/chart-render.ts` (erweitert).** `opts.axis` wird vom Boolean zu Daten
(`AxisVM | undefined`). Mit Achsendaten baut `renderChart` einen Grid-Wrapper:

```
┌──────────┬──────────────────────────┐
│ y-Labels │  <svg> (unverändert)     │
├──────────┼──────────────────────────┤
│          │  x-Labels                │
└──────────┴──────────────────────────┘
```

y-Labels sitzen in einer eigenen Spalte (kein Overlay über der Zeichenfläche), absolut auf
`top: topPct%`. x-Labels sitzen in der Zeile darunter auf `left: leftPct%` mit
`transform: translateX(-50%)`. Wochenlinien werden als `<line>` im SVG gezeichnet, schwächer
als die Gitterlinien.

**Warum HTML-Labels statt SVG-`<text>`:** Das SVG skaliert über `width: 100%` bei
`height: auto`, die Skalierung ist also uniform — aber die Schriftgröße wäre an die
Containerbreite gekoppelt. Bei viewBox-Breite 640 schrumpft `font-size: 12` in einer
300-px-Sidebar auf effektiv ~5,6 px. Das ließe sich nur beheben, indem man die
Skalierungsstrategie des Charts ändert — und die trägt auch die Sparklines der Übersicht.
HTML-Labels tragen `--font-ui-smaller` und Theme-Farben, unabhängig von der Containerbreite.
Preis: zwei Koordinatensysteme, aufgelöst durch die Prozentwerte aus dem View-Model.

**`src/obsidian/tabs/detail.ts` (erweitert).** Unter der Statistik-Zeile, **nur wenn
`!vm.empty`**, eine Aufklapp-Sektion via `collapsibleSection`:

```
▸ Werte (30)
  [ Kopieren ] [ Speichern ]   ( ● MD  ○ CSV )
  Ordner: [ 30_Health/Exporte________ ]
  ┌────────────┬─────────┬─────┬─────┐
  │ Datum      │ Ø (bpm) │ Min │ Max │
  └────────────┴─────────┴─────┴─────┘
```

- **Kopieren** trägt `mod-cta` (Primäraktion), **Speichern** ist klassenlos-neutral —
  Button-Rollen nach UI-STANDARD §2.
- **Format-Umschalter** übernimmt die Optik der bereits vorhandenen Range-Leiste
  (`ah-range-btn` mit `is-active`) statt ein neues Widget einzuführen — dasselbe Muster steht
  direkt darüber schon für 1M/3M/1J/Alles.
- **Ordner-Feld** mit `FolderSuggest`; leer bedeutet Vault-Wurzel.
- Der Titel nennt die Zeilenzahl.

**`src/main.ts` (erweitert).** `PluginData` wächst um `exportFolder: string`,
`exportFormat: "md" | "csv"` und `valuesCollapsed: boolean`; `DashboardHost` bekommt die
zugehörigen Getter/Setter und implementiert `CollapsibleStorage` gegen `data.json`.

**Warum der Aufklappzustand persistiert wird:** Der Detail-Tab rendert bei jedem
State-Wechsel neu. Ein nur im DOM gehaltener Zustand wäre nach dem ersten Range-Klick weg —
exakt der Bug, der in Slice 2 bei den Kategorien auftrat (`a4289dd`).

### 3. i18n und CSS

Neue Keys in `src/i18n/strings.ts` (EN kanonisch, DE vollständig): `axis.week`,
`table.title`, `table.colDate`, `table.colWeek`, `table.colMonth`, `table.colValue`,
`export.copy`, `export.save`, `export.folder`, `export.copied`, `export.copyFailed`,
`export.saved`, `export.saveFailed`. Die EN/DE-Paritätsprüfung aus Slice 3b deckt sie
automatisch mit ab.

Für die `measure`-Spalten werden **keine neuen Keys angelegt** — `stat.avg`, `stat.min` und
`stat.max` existieren bereits für die Statistik-Zeile und beschriften dieselben Größen. Ein
zweiter Satz Keys für „Ø" wäre eine Übersetzungsquelle, die auseinanderlaufen kann.

`styles.css` bekommt: Achsen-Grid und Label-Layer, Wochenlinie, Tabellen-Styling,
Export-Zeile — sowie `COLLAPSIBLE_CSS` aus dem Kit-Modul. Ausschließlich Theme-Variablen,
Präfix `ah-` (UI-STANDARD §3).

## Datenfluss

```
health-cache.json
   └─ buildDetailVM(cache, metricId, range, dims)
        ├─ resolveRange        → { from, to, granularity }
        ├─ rollupDaily         → RollupPoint[]        ← eine Quelle für Chart UND Tabelle
        ├─ buildChartGeometry(points, kind, dims, { granularity })
        │                      → geometry + xTicks + weekMarks
        ├─ formatTickLabel     → Achsentexte
        └─ Spalten je Policy   → table.rows / table.rowsRaw
             ↓
        DetailVM { chart, axis, table, stats, … }
             ↓
   renderDetail
        ├─ renderChart(box, vm.chart, { axis: vm.axis })
        └─ collapsibleSection → Export-Zeile + Tabelle
                                    ↓
                     toMarkdownTable / toCsv
                          ├─ copyToClipboard      (Zwischenablage)
                          └─ writeExport          (Vault-Datei)
```

Chart und Tabelle stammen aus **derselben** `rollupDaily`-Ausgabe. Was exportiert wird, ist
damit per Konstruktion identisch mit dem, was das Chart zeigt — es gibt keinen zweiten
Rechenweg, der auseinanderlaufen könnte.

## Fehlerbehandlung

| Fall | Verhalten |
|---|---|
| `navigator.clipboard` fehlt | Notice `export.copyFailed`, kein Throw |
| `writeText` abgelehnt | dieselbe Notice |
| Zielordner existiert nicht | `mkdir` legt ihn an |
| Ordnerpfad zeigt auf eine Datei / nicht schreibbar | Notice `export.saveFailed` mit der Fehlermeldung, kein Teil-Schreiben |
| Zeitraum ohne Daten (`vm.empty`) | Sektion wird nicht gerendert |
| Zielpfad belegt | Suffix zählt hoch, nie überschreiben |

## Tests

**Pure (vitest, ohne Obsidian):**

- `chart-geometry`: Tick-Auswahl bei n = 0/1/5/91; `weekMarks` nur bei `granularity: "day"`;
  Wochenlinie am Slot-Anfang statt auf der Balkenmitte; **dreiargumentiger Aufruf liefert
  weiterhin leere `xTicks`/`weekMarks`** (Sparkline-Regression).
- `format`: `formatTickLabel` für alle drei Granularitäten in beiden Sprachen.
- `serialize`: Pipe-Escaping im Markdown (Zelle mit `|` bleibt eine Zelle); CSV-Quoting bei
  Komma, Anführungszeichen und Zeilenumbruch; verdoppelte Anführungszeichen.
- `export-path`: `sanitizeBase` mit verbotenen Zeichen; `joinPath` mit und ohne Slash-Rauschen;
  Namensbau.
- `view-model`: Spaltenaufbau je Policy; `rows` formatiert vs. `rowsRaw` roh; Prozentwerte der
  Achse; `empty` liefert keine Tabelle.

**Mit Obsidian-Mock** (`obsidian-kit/testing`, Muster aus dem Skill
`obsidian-plugin-test-pattern`):

- `export-writer`: Kollisionszählung — zweiter Export derselben Metrik landet auf ` 2`,
  bestehende Datei bleibt unangetastet; `mkdir` bei fehlendem Ordner.
- `clipboard`: fehlendes `navigator.clipboard` erzeugt eine Notice und wirft nicht.

**Zeitzonen-Härtung (über den Slice hinaus, bewusst mitgenommen):** `vitest.config.ts` wird
auf `env: { TZ: "America/New_York" }` festgelegt. Der UTC-Fallstrick der Datumslabels lässt
sich sonst nicht beweisen — in UTC ist der fehlerhafte Code nicht von korrektem zu
unterscheiden. Nebeneffekt: `apple-date.ts`, `rollup.ts` und der Aggregator verarbeiten
zeitzonenbehaftete Apple-Daten und werden bislang nur in UTC getestet. **Fallen dabei
bestehende Tests, ist das ein Fund und wird als eigener Befund gemeldet — nicht im Slice
versteckt.**

## Smoke-Test (Pallas, nach dem Merge)

Node-Tests können die Naht zum Host nicht prüfen; die Slice-1/2-Lektion (Worker im Renderer,
Kategorie-Kollaps) gilt weiter.

1. Achsen in allen vier Zeiträumen, in **de und en**.
2. **Ansicht schmal in der Sidebar gegen breit im Editor-Tab** — der Fall, für den Ansatz A
   gewählt wurde: Labels müssen in beiden Breiten lesbar bleiben.
3. Montagslinien bei 1M und 3M vorhanden, bei 1J und „Alles" abwesend.
4. Kopieren → in eine Notiz einfügen, als MD und als CSV.
5. Speichern → Ordner-Autocomplete tippen und klicken; Datei landet im gewählten Ordner;
   zweiter Export erzeugt ` 2` statt zu überschreiben.
6. Aufklappzustand übersteht Range-Wechsel **und** Obsidian-Neustart.
7. Übersicht und Sparklines unverändert.

## Bewusst nicht in diesem Slice

- **Kein Settings-Tab.** Ordner und Format leben sichtbar in der Export-Zeile und in
  `data.json`; das Plugin hat bis heute keinen Settings-Tab und braucht für diesen Slice keinen.
- **Kein Sortieren oder Filtern der Tabelle.** Sie ist Kontrolle vor dem Export, kein
  Analysewerkzeug.
- **Kein Öffnen der geschriebenen Datei**, keine Frontmatter-Anreicherung, kein
  Mehrfach-Metrik-Export.
- **Keine Perf-Memoization der Übersicht** — offener Follow-up aus Slice 2, unabhängig von
  diesem Slice.

## Registry-Nachtrag (beim Abschluss)

- `copyToClipboard` erreicht mit diesem Plugin **n=3** (json_viewer, kuro-gamification,
  health-vitals) → REGISTRY-Status auf Kit-Kandidat heben, im nächsten drift-audit behandeln.
- Die versionierte Pfadauflösung erreicht **n=3** (paperize, epub-exporter, health-vitals) →
  ebenfalls Kit-Kandidat.
- CSV-Serialisierung ist das **erste Exemplar** im Ökosystem → als Katalogeintrag ergänzen
  (Wissen ab n=1).
- `folder-suggest.ts` liegt hier erstmals nach UI-STANDARD §9 korrekt in
  `src/vendor/kit-obsidian/` — beim Kit-Extraktionsschritt als Referenz nennen.

## Nachtrag nach der Umsetzung (2026-07-28)

**Das Kopier-Feedback am Button wurde nicht übernommen.** Die Tabelle oben führte
`CopyButton.ts` aus `json_viewer` als zu übernehmenden Baustein („✓" für 800 ms am Knopf).
Umgesetzt ist stattdessen eine `Notice` mit der Zeilenzahl. Funktional gleichwertig — eine
Rückmeldung, dass der Kopiervorgang geklappt hat —, aber es ist eine andere Lösung als die
hier versprochene, und keine Task hat die Abweichung bemerkt: Jede prüfte nur gegen ihren
eigenen Auftrag, und der Abschluss-Review über den ganzen Branch fand sie als Einzigen.

Der Unterschied ist nicht bloß kosmetisch: Das Knopf-Feedback sitzt dort, wo der Blick beim
Klick ohnehin ist; eine Notice erscheint am Bildschirmrand. Wer das nachziehen will, findet
das Muster unverändert in `json_viewer/src/obsidian/CopyButton.ts` — mit `window.setTimeout`,
nicht `activeWindow.setTimeout` (`obsidianmd/prefer-window-timers`).

**Bewusst offen gebliebene Punkte** aus dem Abschluss-Review, dokumentiert damit sie nicht
als Versehen gelesen werden:

- **Zwei Mechanismen für denselben Aufklappzustand.** Die Übersicht merkt sich ihre
  Kategorien in einem `Set` am View (überlebt keinen Neustart), die Werte-Sektion persistiert
  über `CollapsibleStorage` nach `data.json`. Erst dieser Slice macht daraus eine Dublette —
  jetzt, wo der persistente Speicher existiert, ist das `Set` ein Konsolidierungskandidat.
- **`npm run lint` läuft ohne `--max-warnings 0`** und meldet Exit 0 trotz 78 Warnungen (alle
  `no-explicit-any` in Tests und Mock, keine im Produktionscode). Das Gate kann auf neue
  Warnungen nicht anschlagen. Repo-Hygiene, unabhängig von diesem Slice.
- **`KIT-MATRIX.md` im Dach kennt den neuen `kit-obsidian/`-Vendor-Ordner nicht.** Die Datei
  ist generiert und wird laut Dach-`AGENTS.md` nie von Hand editiert — sie zieht beim
  nächsten `drift-audit` nach.
