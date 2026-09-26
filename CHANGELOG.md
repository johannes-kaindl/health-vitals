# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

## [0.7.1] — 2026-09-26

### Changed

- Die Tab-Leiste des Dashboards (Übersicht/Detail/Workouts) läuft jetzt über den
  verbindlichen Kit-Baustein `buildHubInto` (obsidian-kit 0.35.0) statt über einen
  Eigenbau. Verhaltensänderung: vollständiges ARIA-Tabs-Muster (`tablist`/`tab`/
  `tabpanel`, roving tabindex, Pfeiltasten-/Home-/End-Navigation) statt des vorherigen
  `role="tab"` ohne `tablist`-Elter (ungültiges ARIA). CSS-Klassen `ah-tabbar`/`ah-tab*`
  → `okit-hub-*` (nur Klassennamen, das Umbruch-Rezept bleibt unverändert).

## [0.7.0] — 2026-09-02

### Added

- Workouts tragen jetzt Distanz und aktiv verbrannte Energie. Die Zahlen stammen aus den
  `WorkoutStatistics`-Kindelementen des Exports — die Attribute `totalDistance`/
  `totalEnergyBurned` gibt es dort nicht.
- Der Workouts-Tab zeigt eine Monatssumme und die Kennzahlen je Zeile.

### Changed

- Cache-Version 3: Bestehende Caches werden verworfen und müssen neu importiert werden.
  Die Kennzahlen lassen sich nicht nachrüsten, weil der Parser sie bisher gar nicht las.
- Die Dauer eines Workouts wird über `durationUnit` umgerechnet statt als Minuten angenommen.

### Fixed

- **Der Zielordner des Werte-Exports wird jetzt normalisiert.** Das Feld nimmt Freitext an;
  ein Backslash oder ein doppelter Schrägstrich darin wanderte bisher unverändert in den
  Pfad (`Notizen//Export` blieb `Notizen//Export`). Backslashes werden zu Schrägstrichen,
  Mehrfach-Schrägstriche fallen zusammen.

### Internal

- Sechs gemeinsame Bausteine kommen jetzt aus **obsidian-kit 0.27.0** statt aus lokalen
  Fassungen (Ablaufzustand, kooperatives Nachgeben, Vault-Pfade, Zwischenablage,
  Einstellungs-Validierung). `tools/sync-kit.sh` erzeugt die Kopien reproduzierbar, jede
  trägt ihren Herkunftsstempel. Am sichtbaren Verhalten ändert sich außer dem Punkt oben
  nichts; drei stille Verhaltensänderungen im Ablaufzustand sind durch neue Tests
  festgehalten, damit ein späterer Rückbau nicht durch ein grünes Gate fällt.

## [0.6.0] — 2026-08-18

### Added

- **Schlafphasen als gestapeltes Balkendiagramm.** Wählt man im Detail-Bereich die Metrik
  „Schlaf", erscheint unter dem Verlauf eine neue Sektion: je Nacht ein Balken, dessen
  Segmente Tief-, Kern- und REM-Schlaf übereinander zeigen. Die Balkenhöhe bleibt dabei
  die Schlafdauer, kurze und lange Nächte sind also weiterhin unterscheidbar. Über einen
  längeren Zeitraum zeigt ein Balken die **durchschnittliche** Nacht der Woche bzw. des
  Monats — nicht deren Summe, sonst beantwortete die Grafik eine andere Frage als die,
  die sie stellt.
- Die durchschnittliche Wachzeit innerhalb der Nächte steht als Kennzahl unter dem
  Phasen-Diagramm. Sie fließt bewusst nicht in den Stapel ein: Wachzeit ist kein Schlaf.
- Ältere Exporte kennen nur „Schlaf" ohne Aufschlüsselung — vor watchOS 9 liefert Apple
  keine Phasen. Solche Nächte erscheinen als neutral eingefärbtes Segment „Unbestimmt";
  überwiegen sie im gewählten Zeitraum, nennt eine Zeile unter der Grafik ihren Anteil,
  damit der einfarbige Bereich als Gerätegrenze lesbar ist und nicht als Fehler.
- Die README zeigt jetzt, wie das Plugin aussieht: sieben Bilder vom Dashboard, vom
  Verlauf mit Achsen, von beiden Zuständen des Phasen-Diagramms, von der Werte-Tabelle
  mit Export, von den Workouts und vom Zustand vor dem ersten Import.
- **Die Farben der Schlafphasen lassen sich per CSS-Snippet ändern** — der Abschnitt
  „Konfiguration" nennt die vier Klassen und sagt dazu, worauf beim Farbwechsel zu achten
  ist. Ein Einstellungs-Tab bleibt es bewusst nicht.

### Fixed

- **Die Phase „Kern" war in hellen Themes zu blass.** Sie kam gegen den Hintergrund auf
  1:2,3 und blieb damit unter dem, was für bedeutungstragende Flächen als lesbar gilt
  (WCAG 1.4.11 verlangt 3:1) — auf einem hellen Theme verschwamm der größte Teil jedes
  Balkens mit dem Untergrund. Die Farbe ist jetzt eine mit der Textfarbe abgedunkelte
  Variante desselben Türkis: Der Farbton und damit die Ordnung Tief → Kern → REM bleiben,
  der Kontrast liegt in hellen wie dunklen Themes über der Schwelle. In dunklen Themes
  war und ist alles unverändert lesbar.


## [0.5.1] — 2026-08-04

### Fixed

- Eine CSS-Eigenschaft (`column-gap`) durch die gleichwertige Kurzform (`gap`) ersetzt.
  Rein intern, ohne sichtbare Wirkung: Die Regel beschreibt den Spaltenabstand eines
  Grid-Layouts, wurde von der automatischen Store-Prüfung aber als mehrspaltiger Textsatz
  gewertet und als möglicherweise unvollständig unterstützt gemeldet.

## [0.5.0] — 2026-08-04

### Fixed

- **Die Schlafauswertung zählte Zeit mehrfach und zeigte dadurch teils unmögliche Werte**
  (bis zu 33,6 Stunden Schlaf an einem Tag). Drei Ursachen, jede für sich ausreichend:
  Die Liegezeit und die Schlafphasen darin wurden addiert; mehrere Geräte beschrieben
  dieselbe Nacht und wurden jeweils voll gezählt; und zwei Nächte fielen auf denselben
  Kalendertag, weil nach dem Startdatum gruppiert wurde. Überlappende Zeiträume werden
  jetzt vereinigt statt summiert, und eine Nacht gehört dem Tag, an dem man aufwacht.
- Die Liegezeit konnte kürzer ausfallen als die Schlafzeit, wenn nur die Uhr Phasen für
  eine Nacht lieferte. Sie schließt die Schlafphasen jetzt ein.

### Changed

- **Schlaf erscheint als zwei gleichrangige Metriken** — „Schlaf" (tatsächlich
  geschlafen) und „Liegezeit" —, statt als eine einzelne Zahl. Ein bestehender
  Favorit auf „Schlaf" wird automatisch übernommen.
- Dauerwerte werden als Stunden und Minuten angezeigt statt in Minuten (`7h 12m` statt
  `432 min`, ab einem Tag `1.799 h`). Betrifft Kacheln, Achsenbeschriftung,
  Statistikzeile und Werte-Tabelle; der CSV-Export behält unverändert die Rohwerte.
  Die Achtsamkeits-Kachel trug dadurch bisher gar keine Einheit.
- **Der gespeicherte Auswertungsstand wird beim ersten Start dieser Version verworfen**
  und muss einmal neu eingelesen werden. Er lässt sich nicht umrechnen: Die dafür nötige
  Unterscheidung zwischen Liegezeit und Schlafphase wurde beim Einlesen verworfen. Ein
  Hinweis im Programm sagt es beim Öffnen.

## [0.4.2] — 2026-07-29

### Fixed

- Weitere interne Testlücke aus derselben Ursache wie in 0.4.1, die auch dort das
  Release-Gate nach dem Tag scheitern ließ. Damit ist 0.4.2 die erste Version dieser
  Reihe, die als GitHub-Release erscheint; die Funktionalität von 0.4.0 ist unverändert
  enthalten.

## [0.4.1] — 2026-07-29

### Fixed

- Interne Testlücke, die das Release-Gate von 0.4.0 nach dem Tag scheitern ließ, weshalb
  0.4.0 nie als GitHub-Release erschien und den Store nicht erreichte. Die Funktionalität
  von 0.4.0 ist unverändert und in dieser Version enthalten.

## [0.4.0] — 2026-07-29

### Added

- Übersicht: Kacheln und der Favoriten-Stern sind per Tastatur erreichbar und mit
  Enter oder Leertaste auslösbar; der Fokus bleibt nach dem Umschalten eines Favoriten
  auf dem betätigten Stern.

### Changed

- Übersicht: Der Aufklappzustand der Kategorien überlebt jetzt den Neustart von
  Obsidian — er liegt im selben Speicher wie der Zustand der Werte-Tabelle.
- Export: Der Kopiervorgang wird am Knopf selbst quittiert statt über eine Meldung am
  Bildschirmrand.

### Fixed

- Übersicht öffnet spürbar schneller: Die Kacheln werden pro Import einmal berechnet
  statt bei jedem Tabwechsel und jedem Favoriten-Klick neu.

## [0.3.0] — 2026-07-28

### Added
- Detail-Chart: Achsenbeschriftung (Datum, Kalenderwoche oder Monat je Zeitraum) und
  Werte an den Gitterlinien.
- Detail-Chart: Wochenanfänge sind bei Tagesauflösung markiert.
- Detail-Ansicht: aufklappbare Werte-Tabelle unter dem Chart.
- Werte-Export als Markdown-Tabelle oder CSV — in die Zwischenablage oder als Datei
  ins Vault, mit Ordnerauswahl. Bestehende Dateien werden nie überschrieben.

## [0.2.0] — 2026-07-23

### Added

- **Bilingual interface (German / English).** The dashboard now follows
  Obsidian's UI language automatically — a German Obsidian shows German, any
  other language shows English. There is no separate setting; switching
  Obsidian's language and restarting switches the plugin too.

### Changed

- Minimum Obsidian version raised to **1.8.7** (the plugin now reads the UI
  language via Obsidian's `getLanguage()` API, available from 1.8.7).

## [0.1.1] — 2026-07-23

### Changed

- Resolve community-store review-scanner warnings: use Obsidian's `createEl`
  helper instead of `document.createElement` in the file picker, and
  `window.setTimeout` instead of `activeWindow.setTimeout` for the import
  yield.
- README now has explicit **Installation** and **Usage** sections.

## [0.1.0] — 2026-07-20

### Added

- First public release. Import your Apple Health export and explore it inside
  Obsidian — everything stays local, no network calls.
- **Streaming import** via a native file picker (`Export.zip` or an unpacked
  `Export.xml`) — handles multi-gigabyte exports without loading them into
  memory. Progress, current phase and a cancel button are shown while it runs;
  the dashboard opens automatically when it's done.
- **Dashboard** with three tabs:
  - **Overview** — one tile per metric with its latest value and a sparkline.
    Pin metrics as favourites; the rest is grouped by category and
    collapsible.
  - **Detail** — click a tile to open its time series, with 1M / 3M / 1Y / All
    range presets. Long ranges roll up automatically (days → weeks → months)
    to keep the chart readable.
  - **Workouts** — monthly workout counts as a bar chart, plus a list of
    recent workouts with type, date and duration.
- Charts are hand-drawn SVG using Obsidian's own theme variables, so they
  adapt to light, dark and community themes without a charting library.
- `isDesktopOnly` — large-export parsing is desktop-only.
