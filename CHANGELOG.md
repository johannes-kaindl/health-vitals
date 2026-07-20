# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) (without a `v` prefix).

## [Unreleased]

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
