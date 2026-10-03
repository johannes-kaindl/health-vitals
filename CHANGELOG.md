# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

## [0.7.2] — 2026-10-03

### Added

- The GitHub release now also carries a ready-to-unpack `health-vitals.zip` (the plugin folder with `main.js`, `manifest.json` and `styles.css`) and a `checksums.sha256` file. For a manual install, download the zip and unpack it into `.obsidian/plugins/` instead of creating the folder and saving three files by hand.

### Changed

- The changelog is now written entirely in English.
- Internal design notes moved out of the repository; the user documentation is unchanged.

## [0.7.1]## [0.7.1] — 2026-09-26

### Changed

- The dashboard's tab bar (Overview/Detail/Workouts) now runs on the mandatory kit
  building block `buildHubInto` (obsidian-kit 0.35.0) instead of a custom build. Behaviour
  change: the full ARIA tabs pattern (`tablist`/`tab`/`tabpanel`, roving tabindex,
  arrow/Home/End key navigation) instead of the previous `role="tab"` without a `tablist`
  parent (invalid ARIA). CSS classes `ah-tabbar`/`ah-tab*` → `okit-hub-*` (class names
  only, the wrapping recipe stays unchanged).

## [0.7.0] — 2026-09-02

### Added

- Workouts now carry distance and active energy burned. The figures come from the
  `WorkoutStatistics` child elements of the export — the `totalDistance`/`totalEnergyBurned`
  attributes do not exist there.
- The Workouts tab shows a monthly total and the key figures per row.

### Changed

- Cache version 3: existing caches are discarded and have to be re-imported. The key
  figures cannot be retrofitted, because the parser did not read them at all until now.
- The duration of a workout is converted via `durationUnit` instead of being assumed to be
  minutes.

### Fixed

- **The target folder of the value export is now normalised.** The field accepts free text;
  a backslash or a double slash in it used to end up unchanged in the path (`Notes//Export`
  stayed `Notes//Export`). Backslashes become slashes, multiple slashes collapse.

### Internal

- Six shared building blocks now come from **obsidian-kit 0.27.0** instead of local
  versions (run state, cooperative yielding, vault paths, clipboard, settings validation).
  `tools/sync-kit.sh` produces the copies reproducibly, each one carries its provenance
  stamp. Apart from the item above, nothing changes in the visible behaviour; three silent
  behaviour changes in the run state are pinned by new tests, so that a later rollback
  does not slip through a green gate.

## [0.6.0] — 2026-08-18

### Added

- **Sleep phases as a stacked bar chart.** If you pick the metric "Sleep" in the Detail
  area, a new section appears below the trend: one bar per night, whose segments show deep,
  core and REM sleep stacked on top of each other. The bar height remains the sleep
  duration, so short and long nights are still distinguishable. Over a longer period a bar
  shows the **average** night of the week or month — not their sum, otherwise the chart
  would answer a different question than the one it asks.
- The average time awake within the nights appears as a key figure below the phase chart.
  It deliberately does not feed into the stack: time awake is not sleep.
- Older exports only know "Sleep" without a breakdown — before watchOS 9 Apple delivers
  no phases. Such nights appear as a neutrally coloured "Unspecified" segment; if they
  dominate the selected period, a line below the chart states their share, so that the
  single-colour area reads as a device limit and not as an error.
- The README now shows what the plugin looks like: seven images of the dashboard, of the
  trend with axes, of both states of the phase chart, of the values table with export, of
  the workouts and of the state before the first import.
- **The sleep phase colours can be changed via a CSS snippet** — the "Configuration"
  section names the four classes and says what to watch for when changing colours. A
  settings tab deliberately stays out.

### Fixed

- **The "Core" phase was too pale in light themes.** Against the background it reached
  1:2.3 and thus stayed below what counts as legible for meaningful areas (WCAG 1.4.11
  requires 3:1) — on a light theme most of every bar blended into the background. The
  colour is now a variant of the same teal darkened with the text colour: the hue, and with
  it the order Deep → Core → REM, stays, and the contrast is above the threshold in light
  and dark themes alike. In dark themes everything was and is unchanged and legible.


## [0.5.1] — 2026-08-04

### Fixed

- Replaced a CSS property (`column-gap`) with the equivalent shorthand (`gap`). Purely
  internal, without visible effect: the rule describes the column gap of a grid layout, but
  the automatic store review treated it as multi-column text and flagged it as possibly
  not fully supported.

## [0.5.0] — 2026-08-04

### Fixed

- **The sleep analysis counted time more than once and thereby sometimes showed impossible
  values** (up to 33.6 hours of sleep on one day). Three causes, each sufficient on its
  own: the time in bed and the sleep phases within it were added up; several devices
  described the same night and were each counted in full; and two nights fell on the same
  calendar day because grouping used the start date. Overlapping periods are now merged
  instead of summed, and a night belongs to the day you wake up.
- The time in bed could turn out shorter than the sleep time if only the watch delivered
  phases for a night. It now includes the sleep phases.

### Changed

- **Sleep appears as two equal-ranking metrics** — "Sleep" (actually slept) and "Time in
  bed" — instead of a single number. An existing favourite on "Sleep" is adopted
  automatically.
- Duration values are shown as hours and minutes instead of minutes (`7h 12m` instead of
  `432 min`, from one day on `1.799 h`). Affects tiles, axis labels, statistics row and
  values table; the CSV export keeps the raw values unchanged. The mindfulness tile
  therefore carried no unit at all until now.
- **The stored analysis state is discarded on the first start of this version** and has to
  be read in once more. It cannot be converted: the distinction between time in bed and
  sleep phase that is needed for it was discarded during import. A notice in the app says
  so when you open it.

## [0.4.2] — 2026-07-29

### Fixed

- Another internal test gap with the same cause as in 0.4.1, which also made the release
  gate fail after the tag. 0.4.2 is thus the first version of this series that appears as
  a GitHub release; the functionality of 0.4.0 is included unchanged.

## [0.4.1] — 2026-07-29

### Fixed

- Internal test gap that made the release gate of 0.4.0 fail after the tag, which is why
  0.4.0 never appeared as a GitHub release and never reached the store. The functionality
  of 0.4.0 is unchanged and included in this version.

## [0.4.0] — 2026-07-29

### Added

- Overview: tiles and the favourite star are reachable by keyboard and can be triggered
  with Enter or Space; after toggling a favourite, focus stays on the star that was
  activated.

### Changed

- Overview: the expanded state of the categories now survives a restart of Obsidian — it
  lives in the same store as the state of the values table.
- Export: the copy action is acknowledged on the button itself instead of via a message at
  the edge of the screen.

### Fixed

- Overview opens noticeably faster: the tiles are computed once per import instead of anew
  on every tab switch and every favourite click.

## [0.3.0] — 2026-07-28

### Added
- Detail chart: axis labels (date, calendar week or month depending on the period) and
  values at the grid lines.
- Detail chart: week starts are marked at daily resolution.
- Detail view: collapsible values table below the chart.
- Value export as a Markdown table or CSV — to the clipboard or as a file into the vault,
  with folder selection. Existing files are never overwritten.

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
