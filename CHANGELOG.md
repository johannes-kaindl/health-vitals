# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
