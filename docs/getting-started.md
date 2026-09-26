# Getting started

This walks you from the install to your first look at your own data: an Apple Health export imported into Obsidian and read in the dashboard. Plan a few minutes for the import itself if your export is large. Health Vitals is desktop-only.

## 1. Install

*Settings* → *Community plugins* → *Browse* → search for **Health Vitals** → *Install* → *Enable*. For a manual install see the [README](https://github.com/johannes-kaindl/health-vitals/blob/main/README.md#install).

## 2. Export your data on the iPhone

In the **Health** app: tap your profile picture → **Export All Health Data**. Health prepares an `Export.zip`; move it to your computer (AirDrop, Files, a cable — any way you like). The plugin never talks to HealthKit, it only reads this file.

## 3. Open the dashboard

Click the **Health Vitals dashboard** ribbon icon (the heart-pulse icon), or open the command palette and run **Health Vitals: Open dashboard**.

Before the first import the dashboard says **No data yet** and points to *Profile → Export All Health Data*.

## 4. Import

Press **Choose export** and pick your `Export.zip` (an unpacked `Export.xml` works too) in the file dialog.

The dashboard now shows **Import running**, with the current step — *Unpacking export…*, *Reading data…*, *Saving result…* — a record counter and a **Cancel** button. A multi-gigabyte export takes a few minutes; nothing is loaded into memory as a whole. When it is done, the **Overview** opens by itself.

## 5. Read the dashboard

- **Overview** — one tile per metric with a sparkline. Pin the ones you care about with the star; they move to **★ Favorites** at the top.
- **Detail** — click a tile to see its time series. The presets **1M / 3M / 1Y / All** change the period; the **Values** table below can be copied or saved as a `.md` or `.csv` file into a vault folder.
- **Workouts** — bars per month, a monthly summary and your most recent sessions.

You should now see your own numbers on the tiles. The result of the import is stored as `health-cache.json` in the plugin folder; the next import replaces it, so repeat step 2 to 4 whenever you want fresh data.

## Where next

- How steps, heart rate and sleep are aggregated, and why sleep is merged rather than summed: the [README](https://github.com/johannes-kaindl/health-vitals/blob/main/README.md#how-it-works).
- Something went differently? See [Troubleshooting](troubleshooting.md).
