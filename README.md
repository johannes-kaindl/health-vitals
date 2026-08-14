# Health Vitals

An Obsidian plugin that reads **Apple Health exports** and makes the data searchable
and visualizable inside your vault.

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/gitea/v/release/jkaindl/health-vitals?gitea_url=https%3A%2F%2Fgit.jkaindl.de&label=release)](https://git.jkaindl.de/jkaindl/health-vitals/releases)
[![Obsidian](https://img.shields.io/badge/obsidian-1.8.7%2B%20·%20desktop%20only-purple)](https://obsidian.md)

*Auch auf Deutsch verfügbar: [`README.de.md`](README.de.md).*

No HealthKit access — Obsidian runs in Electron, and HealthKit is a native iOS/macOS
API. This plugin works with the export file you send yourself from the Health app.

## Features

- Reads `Export.zip` or an unpacked `Export.xml` **as a stream** — several gigabytes
  without filling up memory.
- **A dashboard with three tabs:** Overview (one tile per metric with a sparkline,
  favourites pinnable), Detail (time series with period presets and a value table),
  Workouts.
- Aggregation that matches the kind of metric — sum, mean with min/max, or duration.
- **Sleep is merged, not summed**, so nights recorded twice don't add up to impossible
  values.
- Copy the value table to the clipboard, or write it as `.md`/`.csv` into a vault
  folder of your choice.
- Charts are hand-drawn SVG without a charting library and use nothing but Obsidian's
  own theme variables.
- Bilingual interface (German/English), following Obsidian's UI language.
- **No network calls** — everything stays on your machine.

## Why

Apple's `Export.xml` easily reaches **several gigabytes** (2.6 GB with 5.7 million
records in the test case). Ordinary XML parsers load all of it into memory and crash.
This plugin parses **as a stream** (SAX-style, chunk by chunk) and stores nothing but
compact daily aggregates — the cache built from 5.7 million records is ~2.7 MB.

## Requirements

- **Obsidian 1.8.7** or newer.
- **Desktop** — the plugin is `isDesktopOnly: true`; importing multi-gigabyte XML files
  only makes sense there.
- An **Apple Health export** (`Export.zip` or an unpacked `Export.xml`), created in the
  Health app on an iPhone. So an iPhone is only needed to produce the export, not to
  use the plugin.

## Install

**From the community store (recommended):** in Obsidian → *Settings* →
*Community plugins* → *Browse* → search for **"Health Vitals"** → *Install* →
*Enable*.

**Manual install:** download `main.js`, `manifest.json` and `styles.css` of the latest
release from the
[releases page](https://github.com/johannes-kaindl/health-vitals/releases), put them
into `<vault>/.obsidian/plugins/health-vitals/`, then enable the plugin under
*Settings* → *Community plugins*.

**From source:** clone the repository, run `npm install && npm run build`, then copy
`main.js`, `manifest.json` and `styles.css` into the same folder.

## Usage

1. In the **Health app** (iPhone): Profile → *Export all health data* → move the
   resulting `Export.zip` to your computer.
2. In Obsidian: the **Health Vitals Dashboard** ribbon icon (or the command palette →
   **"Health Vitals: Open dashboard"**).
3. Click **"Choose export"** in the dashboard and pick the `Export.zip` (or an unpacked
   `Export.xml`) in the file dialog.

A large export takes a few minutes. Progress, current phase and a cancel button stay
visible in the dashboard while it runs; the overview opens by itself afterwards.

The result is `health-cache.json` in the plugin directory: daily aggregates per metric
plus a list of workouts.

The interface is bilingual (German/English) and follows Obsidian's UI language
automatically — a German Obsidian shows German, anything else shows English. There is
no separate setting for it.

### Dashboard

Command palette → **"Health Vitals: Open dashboard"** (or the ribbon icon). The
dashboard loads `health-cache.json` **lazily** when opened, so vault startup stays
untouched. Three tabs:

- **Overview** — one tile per metric with a headline figure and a sparkline. Metrics
  can be pinned to the top as favourites with a star (this is remembered); the rest is
  grouped by category and collapsible.
- **Detail** — clicking a tile opens the time series: period presets 1M / 3M / 1Y /
  All, with the matching figures below. Long periods are bucketed automatically (days →
  weeks → months) to keep the chart readable. Below that, a value table with the
  underlying rows can be expanded; its contents can be copied to the clipboard or
  written as a Markdown or CSV file into a vault folder of your choice (see
  "Privacy").
- **Workouts** — workouts per month as bars, with the most recent sessions listed
  below by type, date and duration.

Charts are hand-drawn SVG without a charting library and use nothing but Obsidian's
theme variables — so they adapt to any theme (light/dark/community).

### Access outside the vault

This plugin reads **one file outside your vault**: the health export you pick in the
file dialog. That is necessary because an Apple Health export is several gigabytes and
does not belong in a vault. That export file is only ever read — nothing about it is
written, moved or sent anywhere. The data derived from it lands as
`health-cache.json` in the plugin directory on your machine.

Separately, the Detail tab can write value tables **inside** the vault as files on
request — that is not access outside the vault, but an ordinary write into a folder you
chose. Details under "Privacy".

## Configuration

The plugin has **no settings tab**. What it remembers, you set where it takes effect —
in the dashboard:

| Setting | Where | Meaning |
|---|---|---|
| Favourites | Star on a tile (Overview) | Pinned metrics sit at the top |
| Collapsed state | Category groups (Overview) | Which groups stay open |
| Export folder | Detail tab, folder field with autocomplete | Target folder of the value table |
| Export format | Detail tab | `.md` or `.csv` |

That is stored in `data.json` in the plugin folder — not in the cache, which the next
import overwrites. The interface language is deliberately not a setting: it follows
Obsidian.

## How it works

### How metrics are aggregated

The presentation follows the kind of metric:

| Kind | Examples | Aggregation | Chart |
|---|---|---|---|
| `sum` | Steps, calories | Daily sum | Bars |
| `measure` | Weight, heart rate | Mean with min/max | Line + band |
| `duration` | Mindfulness | Sum of intervals | Bars |

Weekly/monthly bucketing sums or averages accordingly (not sums) — a mean heart rate
over a month stays a mean.

Durations are shown as hours and minutes (`7h 12m`), and as hours only beyond a day.
The CSV export instead contains the raw values in minutes.

### Sleep

Sleep is not aggregated like the other metrics and appears as **two equally ranked
values**: "asleep" (time actually slept) and "in bed".

The reason lies in the data: Apple exports the same time several times over for the
same night — time in bed encloses the sleep stages within it, and several devices
(iPhone, watch, third-party apps) describe the same night in parallel. Added up, that
yields impossible values. Overlapping intervals are therefore **merged rather than
summed**: time recorded twice counts once.

A night belongs to the day you **wake up** on. Sleep starting from 20:00 counts towards
the following day — otherwise the night that ends in the morning and the one that
begins in the evening would fall on the same calendar day.

## Privacy

Health data is particularly sensitive. Therefore:

- **Everything stays local.** The plugin sends nothing anywhere; there are no network
  calls.
- `health-cache.json` is **gitignored** — it never ends up in a repository by accident.
  There is no `import/` folder anymore; the export is read straight from the file
  dialog, without anything being copied into the plugin directory.
- `isDesktopOnly: true` — importing large XML files only makes sense on the desktop.
- **The value export in the Detail tab writes into your vault, but only when you click
  "Save".** There is an expandable value table there with the raw values of the current
  metric and period; clicking "Save" puts them as a `.md` or `.csv` file into a vault
  folder you chose (folder field with autocomplete over your existing folders). The file
  name is composed of the metric name plus the first and last time key of the table. If
  the file already exists, it is **never overwritten** — the plugin appends a running
  number instead (` 2`, ` 3`, …) until it finds a free name. These export files then sit
  in your vault like any other note: if your vault is synced or versioned, so are they.

If you sync your vault, `health-cache.json` sits in the plugin folder under
`.obsidian/` and comes along depending on your sync configuration — deliberately your
decision.

## Development

```bash
npm run dev        # esbuild watch
npm run build      # typecheck + production bundle → main.js
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (obsidianmd, type-checked)
npm run deploy     # build + copy to $OBSIDIAN_PLUGIN_DIR
```

The code is split into a **pure core layer** (`src/core/` — parser, aggregation, chart
geometry, view models; no `obsidian` import, testable in Node) and an **Obsidian layer**
(`src/obsidian/` — view, SVG rendering, file access). Conventions and architecture
notes: `AGENTS.md`.

**Note for contributors:** renderer-specific behaviour (SVG DOM, `ItemView`, web
workers) is invisible to Node unit tests — changes to the Obsidian layer need a manual
test in real Obsidian on top.

## License

Copyright © 2026 Johannes Kaindl

Licensed under the [GNU AGPL v3.0 or later](https://github.com/johannes-kaindl/health-vitals/blob/main/LICENSE).
