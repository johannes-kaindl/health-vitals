# Import-Workflow & Store-Konformität — Design (Slice 3a)

**Datum:** 2026-07-20
**Status:** freigegeben (Brainstorming), bereit für Implementierungsplan
**Vorläufer:** Slice 1 (Streaming-Parser), Slice 2 (Dashboard-UI)
**Zweck:** letzter Slice vor der Einreichung im Obsidian Community-Store

## Ziel

Der Import-Mechanismus funktioniert (5,7 Mio Records im Smoke-Test), aber der **Weg dorthin**
ist nicht zumutbar: Der Nutzer muss die `Export.zip` per Finder in ein verstecktes Verzeichnis
(`<vault>/.obsidian/plugins/apple-health/import/`) kopieren, bevor ein Command sie findet.
Dieser Slice ersetzt das durch eine Dateiauswahl im Dashboard, macht den mehrminütigen Lauf
sichtbar und abbrechbar, und bringt das Plugin auf Store-Konformität.

Die Chart-Verfeinerungen aus dem Smoke-Feedback (Achsen-Labels, Werte-Tabelle) sind
**bewusst nach hinten geschoben** — sie blockieren kein Release, ein unauffindbarer Import schon.

## Kontext & Constraints

- **Renderer-only-Bugs sind node-test-blind.** Zweimal bestätigt (fflate-Worker `beab394`,
  Kategorie-Kollaps `a4289dd`). Manueller Smoke-Test im `00_ProtoVault` mit dem echten
  2,6-GB-Export ist Teil der Definition of Done, kein Extra.
- **Kein Web Worker.** `fflate`s `AsyncUnzipInflate` spawnt Worker, was im Electron-Renderer
  fehlschlägt (`beab394`). Nebenläufigkeit wird kooperativ gelöst, nicht per Worker.
- **Bestehende Schichtung bleibt:** `src/core/` dependency-frei und in Node testbar,
  `src/obsidian/` trägt IO und DOM.

### Recherchestand Store-Guidelines (2026-07-20, belegt)

Geprüft gegen [Developer policies](https://docs.obsidian.md/Developer+policies),
[Submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submission+requirements+for+plugins),
[Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines),
[Manifest reference](https://docs.obsidian.md/Reference/Manifest), `obsidianmd/eslint-plugin`.

| Frage | Belegter Stand |
|---|---|
| „Obsidian" in `description` | **Erlaubt.** Verboten nur in `name` und `id`. Korrekte Großschreibung wird sogar verlangt. |
| `description`-Form | Max. 250 Zeichen, **Punkt am Ende**, Aktionsverb-Einstieg. |
| `fundingUrl` | Ohne Sponsoring **entfernen**, nicht leer lassen. |
| `LICENSE` | **Formal verlangt** (Developer policies), Bot prüft via `validate-license` inkl. Copyright-Jahr. |
| Englisch-Pflicht UI-Strings | **Nicht belegbar.** Pflicht nur für `name`/`description`. Linter bringt `recommendedWithLocalesEn` + `ui/sentence-case-locale-module` mit → i18n ist ein vorgesehener Pfad. |
| Cache im Plugin-Ordner | Erlaubt, kein Größenlimit dokumentiert. Pfad über `vault.configDir` + `normalizePath()`, **nie** `".obsidian/..."` literal (`hardcoded-config-path`). |
| Dateien außerhalb des Vaults lesen | Erlaubt, aber **README-Disclosure-Pflicht** („Clearly explain why this is needed"). |
| `node:fs` | Erlaubt bei `isDesktopOnly: true`, löst aber `no-nodejs-modules` (warn) aus. |

**Offener Widerspruch (nicht geklärt):** Die LESSONS-Notiz zu local-image-generator protokolliert
das Wort „Obsidian" in der *description* als harten Blocker; die Doku sagt, dort sei es erlaubt.
Entweder war es in Wahrheit der `name`, oder der Bot ist strenger als seine Dokumentation.
**Zu prüfen, bevor diese Lektion weitere Entscheidungen steuert.** Für dieses Repo ohne Belang —
`name` („Apple Health") und `id` („apple-health") sind sauber.

**Nicht belegbar geblieben:** Größenlimit für Plugin-Ordner-Daten, exakte Blocker-Schwelle des
Bots (warn vs. error), ob `no-forbidden-elements` `<input type="file">` erfasst. Letzteres wird
durch den lokalen Lint-Lauf gemessen statt vermutet.

## Getroffene Entscheidungen (Brainstorming 2026-07-20)

1. **i18n-Layer** statt Englisch-Umstellung oder Warning-Unterdrückung. Muss **vor** den neuen
   Import-Texten liegen, sonst werden sie zweimal geschrieben.
2. **Datei-Picker im Dashboard** als Einstieg — trifft den Erst-Start-Moment dort, wo der Nutzer
   ohnehin landet. Kein Kopieren, kein verstecktes Verzeichnis.
3. **Fortschritt im Dashboard-Tab** (Zähler, Phase, Abbrechen) statt Notice-Stapel.
4. **Der `import/`-Ordner-Weg entfällt ersatzlos** — ein Weg statt zwei.
5. **Kein „Pfad merken".** Ursprünglich anders entschieden, nach der Guidelines-Recherche
   revidiert: Ein `File`-Objekt ist nicht persistierbar, und `File.path` zu lesen erzwingt
   `node:fs`, `isDesktopOnly` und eine Lint-Warnung. Ein Health-Export wird selten neu erzeugt —
   der Komfortgewinn trägt diese Kosten nicht.
6. **Kein Settings-Tab.** Nach Wegfall des gemerkten Pfads gibt es nichts einzustellen; ein leerer
   Tab zöge nur `require-display`/`prefer-setting-definitions` auf sich.

## Architektur

### `src/core/` — rein, kein `obsidian`-Import, in Node testbar

- **`strings.ts`** — `Record<Lang, Record<Key, string>>` für `de`/`en` plus `t(key, lang)`.
  Locale wird von außen hereingereicht, nicht selbst ermittelt.
- **`import-state.ts`** — Zustandsautomat des Imports:
  `idle → running(records, phase) → done(cache) | aborted | failed(error)`.
  `phase` ist eine von drei: `unzipping` (nur bei `.zip`), `parsing`, `writing`.
  Macht die Fortschrittslogik ohne DOM testbar.
- **`pipeline.ts`** *(geändert)* — `aggregateStream` nimmt ein `AbortSignal`, prüft es zwischen
  den Chunks und wirft bei Abbruch `ImportAbortedError`. Einzige erzwungene Kern-Änderung.

### `src/obsidian/` — IO & DOM

- **`file-picker.ts`** — dünner Wrapper um `<input type="file">`, liefert ein `File`.
  Isoliert die Browser-Eigenheit an einer Stelle.
- **`import-controller.ts`** — hält den `AbortController`, ruft die Pipeline, schreibt den Cache,
  meldet Zustandsübergänge. Kapselt allen Nebeneffekt.
- **`tabs/import.ts`** — Import-Screen: Leerzustand mit Button, Laufzustand mit
  Zähler/Phase/Abbrechen, Fehlerzustand mit „Erneut versuchen".
- **`health-source.ts`** *(geändert)* — `openImportSource(file: File)` statt `(absPath: string)`.
  Chunks kommen aus `file.stream()` statt aus einem `fs`-Stream; die fflate-Entpacklogik bleibt
  inhaltlich unverändert.
  - `pickImportFile(names)` **entfällt** — es wählte die jüngste Datei aus dem `import/`-Ordner
    und verliert mit diesem seinen Zweck; der Nutzer wählt jetzt genau eine Datei.
  - `isExportEntry` bleibt, muss aber `basename` aus `node:path` durch eine eigene Zeile
    ersetzen. Sonst bliebe ein `node:`-Import stehen und `no-nodejs-modules` gälte weiter —
    der Umbau wäre umsonst.
- **`dashboard-view.ts`** *(geändert)* — der bestehende Empty-State wird zum Einstiegspunkt;
  nach erfolgreichem Import automatischer Wechsel auf die Übersicht.
- **`main.ts`** *(geändert)* — `runImport()` delegiert an den Controller; `readdir`/`import/`-Logik
  entfällt; **`node:fs` und `getBasePath()` verschwinden vollständig**. Cache-IO über
  `app.vault.adapter` mit
  `normalizePath(\`${vault.configDir}/plugins/${manifest.id}/health-cache.json\`)`.

**Leitgedanke:** `import-state` weiß, *was* passiert, aber nichts davon, *wie es aussieht*;
`tabs/import.ts` weiß, wie es aussieht, aber nichts davon, wie es passiert. Der logiktragende
Teil bleibt testbar, der renderer-only-Teil klein.

## Datenfluss

1. Dashboard öffnen → `loadCache()` liefert `null` → Import-Screen statt Übersicht
2. „Export auswählen" → `file-picker` → `File`
3. `import-controller` erzeugt `AbortController`, startet
   `aggregateStream(openImportSource(file), meta, onProgress, signal)`
4. `onProgress` → `import-state` → gedrosseltes Re-Render von Zähler und Phase
5. Erfolg → Cache via Adapter schreiben → Umschalten auf Übersicht
6. Abbruch → `ImportAbortedError` → zurück zum Einstieg, **kein halber Cache auf Platte**
7. Fehler → Fehlertext im Screen + „Erneut versuchen" (nicht als wegklickbare Notice)

## Renderer-Blockieren (bekanntes Risiko)

Der Parser ist CPU-gebunden und läuft im Renderer-Thread. Bei Notices war das folgenlos —
eine Fortschrittsanzeige *im Dashboard* ist dagegen genau dann wertlos, wenn sie einfriert:
Der Zähler steht still und der Abbrechen-Button reagiert nicht, weil der Klick nie verarbeitet
wird. Das ist die wahrscheinlichste Art, wie Entscheidung 3 scheitert.

**Lösung:** kooperatives Yielding — der Controller schiebt periodisch (~alle 250 ms) einen
Makrotask ein, damit der Renderer zeichnen und Klicks verarbeiten kann. Kostet Durchsatz und ist
der Preis für einen funktionierenden Abbrechen-Button. Zusätzlich wird das Re-Rendern gedrosselt;
bei 5,7 Mio Records darf nicht jeder Callback das DOM anfassen.

**Plan B (dokumentiert, nicht bevorzugt):** Zeigt der Smoke-Test trotzdem Ruckeln, Rückfall auf
eine einzelne ersetzende Notice (`setMessage`). Das wäre ein **Rückschritt gegenüber
Entscheidung 3** und ist als solcher zu verbuchen, nicht wegzudiskutieren.

## Store-Konformität (Strang C)

1. `manifest.json` — Punkt am Ende der `description`, `fundingUrl` entfernen.
2. `LICENSE` anlegen (AGPL-3.0-or-later, Copyright-Jahr korrekt).
3. Cache-Zugriff über Adapter + `configDir` + `normalizePath` → adressiert
   `hardcoded-config-path` und `no-nodejs-modules` an der Wurzel.
4. **README-Disclosure** (Pflicht): ausdrücklich benennen, dass eine Datei außerhalb des Vaults
   gelesen wird und warum (ein 2,6-GB-Export gehört nicht in den Vault).
5. Lint-Gate auf `manifest.json`/`LICENSE` ausweiten — `eslint src` läuft heute daran vorbei.
   Config gegen `recommendedWithLocalesEn` prüfen, passend zum i18n-Modul.
6. Voller Lint-Lauf als Einreichungs-Beleg (derselbe Regelsatz wie der Bot).

## Tests

- **`strings`** — Vollständigkeit: jeder Key existiert in `de` **und** `en`. Der Test, der i18n
  davor bewahrt, still zu verrotten.
- **`pipeline`** — Abbruch mitten im Stream wirft `ImportAbortedError`; kein Cache-Write danach.
- **`import-state`** — alle Übergänge, inkl. „Fehler nach Abbruch wird ignoriert".
- **`health-source`** — `openImportSource` gegen ein `File`-Double (zip und plain xml).
- **Node-test-blind, nur im Smoke-Test:** `file-picker`, `tabs/import.ts`, Umschalten nach Erfolg,
  Responsivität während des Laufs, Abbrechen-Button unter Last. Manueller Durchlauf im
  `00_ProtoVault` mit dem echten Export ist Teil der DoD.

## Reihenfolge (verbindlich)

**A (i18n) → B (Import-UX) → C (Store-Konformität).**
A vor B, weil sonst jeder Import-, Fehler- und Fortschrittstext zweimal geschrieben wird.
C ist unabhängig und überwiegend mechanisch.

## Out of Scope (Folge-Slices)

- Detail-Balken mit Wochenanfang-/Montags-Betonung, Achsen-Labels, Werte-Tabelle
  (Smoke-Feedback Slice 2) — nach der Einreichung.
- Perf-Memoization der Übersicht; Stern-Kachel tastaturbedienbar (`role`/`tabindex`).
- DRY-Nits: measure-Ø doppelt in `computeStats`/`rollupDaily`.
- Inkrementeller Import (Apple exportiert ohnehin stets den Gesamtbestand).
- Mobile-Unterstützung — `isDesktopOnly` bleibt `true`. Nach dem Wegfall von `node:fs` technisch
  nicht mehr zwingend, aber einen 2,6-GB-Export auf einem Telefon zu parsen ist kein Versprechen,
  das dieses Plugin geben sollte.
