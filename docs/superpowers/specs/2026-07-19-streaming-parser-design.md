# Design: Streaming-Parser + Tages-Aggregation

**Datum:** 2026-07-19
**Repo:** `apple-health` (Obsidian-Plugin)
**Status:** Freigegeben (Brainstorming) — bereit für Implementierungsplan

## Ziel & Kontext

Das Plugin parsed einen **Apple-Health-XML-Export** und macht die Daten im Vault
durchsuchbar/visualisierbar. Der reale Export (`import/2026-07-17_Health.zip`) enthält
`apple_health_export/Export.xml` mit **2,59 GB** und **~5,6 Mio `Record`-Elementen** plus
**768 `Workout`-Elementen**; DOM-Parsing scheidet damit aus (AGENTS.md-Gotcha) — Streaming
ist zwingend.

**MVP-Ziel (mehrere Sessions):** Ein **Dashboard** mit Tages-/Wochen-Zeitreihen pro Metrik.
Deshalb aggregiert der Parser **beim Streamen** zu Tages-Buckets; Rohsamples werden verworfen.

**Umfang DIESER Session (Slice):** Pure Core + obsidian Import-Layer + ein Command, der den
echten Export einliest und den Cache schreibt. **Kein Dashboard-UI** (Folge-Session).

### Getroffene Entscheidungen (Brainstorming 2026-07-19)

1. **MVP-Ziel:** Tages-Übersichten / Dashboard → Aggregation beim Streamen.
2. **Datenquelle:** `.zip` **und** `.xml` unterstützen. Bei `.zip` streamend entpacken (kein
   2,6-GB-Duplikat auf Platte, kein manueller Schritt).
3. **XML-Parse-Strategie:** **Handgeschriebener, dep-freier Streaming-Tokenizer** im pure Core
   (statt SAX-Library). Grammatik ist flach; voll TDD-testbar; passt zum Ökosystem-Muster
   (dep-freie pure Cores) und wird REGISTRY-/Kit-Kandidat („streaming XML tokenizer", 1. Exemplar).
4. **Zip-Reader:** `fflate` streaming `Unzip` (ökosystem-bewährte Dependency — `epub-exporter`
   nutzt `fflate` bereits im ZIP-Writer-Round-Trip-Test).
5. **Cache-Ort:** **Separate Datei** im Plugin-Dir (`health-cache.json`), **lazy** geladen (erst
   beim Öffnen des Dashboards). Verfeinert die AGENTS.md-Zeile „Cache in data.json" — die
   Intention war „gecacht & gitignored", nicht zwingend `data.json`. Grund: mehrere MB würden
   Obsidian sonst bei **jedem** Plugin-Start synchron laden. AGENTS.md + `.gitignore` werden
   angepasst.

## Reale Datenstruktur (aus dem Export verifiziert)

```xml
<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone JK" unit="count"
        creationDate="2022-11-25 08:50:04 +0200" startDate="2022-11-25 08:39:02 +0200"
        endDate="2022-11-25 08:47:00 +0200" value="214"/>

<Record type="HKQuantityTypeIdentifierBodyMass" unit="kg" ... value="90.1">
  <MetadataEntry .../>   <!-- Container-Record: NICHT self-closing, geht über mehrere Zeilen -->
</Record>

<Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining"
         duration="1.2432..." durationUnit="min" startDate="2017-11-10 12:54:42 +0200"
         endDate="2017-11-10 12:55:56 +0200"> ... </Workout>
```

Beobachtungen, die das Design treiben:
- Datumsformat: `YYYY-MM-DD HH:MM:SS ±ZZZZ` (lokaler Offset eingebettet).
- Attributwerte können XML-Entities enthalten (`device="&lt;&lt;HKDevice…&gt;"`).
- Records sind **entweder** self-closing (`/>`) **oder** Container mit Kindern (`MetadataEntry`).
  → Zeilen-/Regex-Extraktion bricht an Container-Records und ist **verworfen**.
- Top-Record-Typen: `ActiveEnergyBurned` (2,19M), `HeartRate` (880k), `BasalEnergyBurned`
  (602k), `DistanceWalkingRunning` (521k), `StepCount` (416k) …
- Kategorie-Typen (`HKCategoryTypeIdentifier…`): `SleepAnalysis`, `AppleStandHour`,
  `MindfulSession` — `value` ist ein Enum-String, kein Zahlenwert.

## Architektur & Schichten (PROF-OBS-03/04)

### `src/core/` — rein, kein `obsidian`-Import, in Node testbar

| Modul | Aufgabe | Öffentliches Interface (Skizze) |
|---|---|---|
| `xml-tokenizer.ts` | Streaming-Tokenizer über Text-Chunks. Puffert Teil-Tags über Chunk-Grenzen. Quote-aware Attribut-Scan, dekodiert die 5 XML-Entities. Emittiert **jedes** Start-Tag (inkl. `MetadataEntry` etc.); Close-Tags/Text werden verworfen. Das Filtern übernimmt der Parser. | `class XmlTokenizer { feed(chunk: string, emit: (t: StartTag) => void): void; end(): void }` mit `StartTag = { name: string; attrs: Record<string,string>; selfClosing: boolean }` |
| `health-parser.ts` | Filtert auf `Record`/`Workout` (übrige Start-Tags werden ignoriert), mappt Attribute → typisierte Events. Ungültige/fehlende Pflicht-Attribute → `skipped`. | `parseHealth(tokens): Iterable<RecordEvent \| WorkoutEvent>` (bzw. Push-Callbacks) |
| `aggregator.ts` | Tages-Bucket-Akkumulation in einer `Map`. `add(event)` + `finalize(): HealthCache`. Zählt `skipped`. | `class Aggregator { add(e): void; finalize(meta): HealthCache }` |
| `aggregation-policy.ts` | Ordnet jedem Typ eine Policy zu: `sum` / `measure` / `duration`. Explizite Sets + Defaults. | `policyFor(type: string): Policy` |
| `apple-date.ts` | `"2022-11-25 08:39:02 +0200"` → lokaler Tag `"2022-11-25"` (nutzt eingebetteten Offset, kein `Date`-TZ-Ratespiel). Ableitung der Minuten-Differenz für `duration`. | `localDay(s: string): string`, `durationMinutes(start, end): number` |
| `types.ts` | `HealthCache`, `MetricSeries`, `DayBucket`, `WorkoutEntry`, `Policy`. | — |

### `src/obsidian/` — IO & Plugin

| Modul | Aufgabe |
|---|---|
| `health-source.ts` | Findet die `import/`-Datei (`.zip` **oder** `.xml`; bei mehreren: neueste). Liefert einen Chunk-Stream des `Export.xml`-Inhalts. Bei `.zip`: `fs.createReadStream` → `fflate` streaming `Unzip`, Entry `apple_health_export/Export.xml` (Basename-Match, robust gegen Ordner-Varianten) → UTF-8-Dekodierung. |
| `import-runner.ts` | Orchestriert Source → Tokenizer → Parser → Aggregator → `HealthCache`. Progress via `Notice` alle N Records. Schreibt `health-cache.json` ins Plugin-Dir. |
| `main.ts` | Registriert Command „Apple Health: Import ausführen". `isDesktopOnly: true`. |

## Datenfluss

```
import/*.zip ─(fs.createReadStream)─▶ fflate Unzip ─▶ Export.xml-Chunks ─┐
import/*.xml ─(fs.createReadStream)──────────────────────────────────────┤
                                                                          ▼
                                        XmlTokenizer.feed(chunk) → StartTag-Tokens
                                                                          ▼
                                     health-parser → RecordEvent / WorkoutEvent
                                                                          ▼
                                        Aggregator.add() (Tages-Buckets, Map)
                                                                          ▼
                                     finalize() → HealthCache → health-cache.json
```

Peak-Memory ist **beschränkt**: nur die Bucket-Map (~40 Typen × ~3300 Tage ≈ 130k Einträge) +
768 Workouts — unabhängig von den 2,6 GB Eingabe.

## Aggregations-Modell (3 Policies)

- **`sum`** — kumulative Mengen → `{ sum, count }` pro Tag.
  Set: `StepCount`, `DistanceWalkingRunning`, `DistanceCycling`, `DistanceSwimming`,
  `ActiveEnergyBurned`, `BasalEnergyBurned`, `FlightsClimbed`, `AppleExerciseTime`,
  `AppleStandTime`, `SwimmingStrokeCount`, `TimeInDaylight`, `DietaryWater`.
- **`measure`** — Momentanwerte (**Default** für unbekannte `HKQuantityTypeIdentifier…`) →
  `{ min, max, avg, count }` pro Tag.
  Beispiele: `HeartRate`, `BodyMass`, `RestingHeartRate`, `HeartRateVariabilitySDNN`,
  `VO2Max`, `OxygenSaturation`, `RespiratoryRate`, `WalkingSpeed`, `BloodPressure*`.
- **`duration`** — Kategorie-/Intervall-Records (**Default** für `HKCategoryTypeIdentifier…`) →
  `{ minutes, count }` pro Tag, `minutes = Σ(endDate − startDate)`.
  Beispiele: `SleepAnalysis`, `AppleStandHour`, `MindfulSession`.

Unbekannte Typen fallen in den zutreffenden Default → **nichts geht verloren**, kein Crash bei
Schema-Drift zwischen Health-App-Versionen (AGENTS.md-Gotcha erfüllt).

**Workouts** (768): vollständig als Liste — `{ type, start, durationMin }` (Energie/Distanz aus
verschachtelten `WorkoutStatistics` sind **out of scope** für diesen Slice, da sie das
Kinder-Parsing erfordern; als Folge-Ausbau vermerkt).

## Cache-Format (`health-cache.json`)

```jsonc
{
  "version": 1,
  "sourceFile": "2026-07-17_Health.zip",
  "importedAt": "<ISO-Zeitstempel, vom Plugin-Runtime>",
  "recordCount": 5600000,
  "skippedCount": 0,
  "dateRange": { "from": "2017-11-10", "to": "2026-07-17" },
  "metrics": {
    "HKQuantityTypeIdentifierStepCount": {
      "unit": "count", "policy": "sum",
      "daily": { "2022-11-25": { "sum": 8231, "count": 42 } }
    },
    "HKQuantityTypeIdentifierHeartRate": {
      "unit": "count/min", "policy": "measure",
      "daily": { "2022-11-25": { "min": 48, "max": 142, "avg": 71.3, "count": 512 } }
    },
    "HKCategoryTypeIdentifierSleepAnalysis": {
      "unit": "", "policy": "duration",
      "daily": { "2022-11-25": { "minutes": 431, "count": 6 } }
    }
  },
  "workouts": [
    { "type": "HKWorkoutActivityTypeTraditionalStrengthTraining",
      "start": "2017-11-10T12:54", "durationMin": 1.24 }
  ]
}
```

`unit` wird beim ersten Auftreten pro Typ festgehalten. `avg` wird aus laufender Summe + `count`
in `finalize()` berechnet (kein Speichern aller Werte).

## Fehlerbehandlung & Robustheit

- **Chunk-Grenzen:** Teil-Tags/-Attribute werden im Tokenizer gepuffert und beim nächsten
  `feed` fortgesetzt. Verifiziert durch Byte-Offset-Split-Tests (dasselbe XML an beliebiger
  Stelle geteilt → identische Token-Folge).
- **`value` fehlt / nicht numerisch** bei Quantity-Records → Record übersprungen, `skippedCount++`,
  kein Abbruch. (Kategorie-Records tragen bewusst keinen Zahlen-`value` → `duration`-Pfad.)
- **Malformte / unbekannte Elemente** → überspringen, weiterparsen.
- **Pflicht-Attribute** (`type`, `startDate`) fehlen → skip.
- **Progress:** `Notice` alle N (z.B. 250k) Records — verarbeitete Record-Zahl (die entpackte
  Gesamtgröße ist aus dem Zip nicht billig bekannt, daher kein Byte-Prozent).
- **Memory:** bounded (nur Bucket-Map + Workouts).

## Tests (vitest, Skill `obsidian-plugin-test-pattern`)

Reiner Core, gegen kleine XML-Fixtures:
- **Tokenizer:** self-closing Record; Container-Record mit `MetadataEntry`-Kind; Entity im
  `device`-Attribut (`&lt;` → `<`); Attribut mit Leerzeichen/Sonderzeichen; `Workout` mit Kindern.
- **Chunk-Boundary:** dasselbe Fixture an mehreren Byte-Offsets gesplittet → identische Tokens.
- **Policy:** je ein Fall `sum` / `measure` / `duration`; unbekannter Quantity-Typ → `measure`;
  unbekannter Category-Typ → `duration`.
- **`apple-date`:** Offset → lokaler Tag; Tagesgrenze (`23:30 +0200`); `durationMinutes`.
- **Aggregator:** Mehrere Records desselben Typs/Tags → korrekte `sum`/`avg`/`min`/`max`;
  `dateRange`-Ableitung; `skippedCount`.

Der echte 2,6-GB-Lauf ist **manueller Smoke-Test** (Command ausführen, `health-cache.json` +
Record-Count + Zeitraum prüfen) — zu groß für CI. Ein getrimmtes Repräsentativ-Fixture (einige
hundert Zeilen) liegt im Repo für einen schnellen End-to-End-Test des `import-runner` in Node.

## Betroffene Config-Änderungen

- `.gitignore`: `health-cache.json` ergänzen (personenbezogen, wie `data.json`/`import/`).
- `AGENTS.md`: Cache-Zeile präzisieren („separate `health-cache.json`, lazy geladen").
- `package.json`: Dependency `fflate`.

## Kit-first-Nachbereitung (verbindlich)

Nach Implementierung REGISTRY-Einträge ergänzen (1. Exemplare):
- „Streaming XML-Tokenizer (dep-frei, chunk-robust, quote-/entity-aware)" → `apple-health/src/core/xml-tokenizer.ts`.
- „Streaming-Unzip eines großen Zip-Entries (fflate `Unzip` + fs-Stream)" → `apple-health/src/obsidian/health-source.ts`.
- Beide als Kit-Kandidaten markieren (bei 2. Consumer promoten).

## Out of Scope (Folge-Sessions)

- Dashboard-UI (Panel/Base, UI-STANDARD.md verbindlich).
- `WorkoutStatistics`/`WorkoutRoute`/GPX (Energie/Distanz/Karten pro Workout).
- Inkrementeller Re-Import / Delta-Update.
- Nicht-numerische Kategorie-Detailauswertung (Schlafphasen-Aufschlüsselung).
