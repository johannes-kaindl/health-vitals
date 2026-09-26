# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text (a German Obsidian shows the German equivalents) — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## Export.xml not found in the zip

> Import failed — Export.xml not found in the zip

The dashboard shows **Import failed** with this message and a **Try again** button.

**Cause:** the zip you picked does not contain an `Export.xml`. It is usually not the Health export — for example a zip of another app, or a zip that was unpacked and packed again with an extra folder level.

**Fix:** pick the original `Export.zip` that the Health app created (*Profile → Export All Health Data*), or unpack it yourself and pick the `Export.xml` inside directly, then press **Try again**.

## Import failed

> Import failed

**Cause:** the export could not be read to the end — a truncated copy (the transfer from the iPhone was interrupted) or a file that is not an Apple Health export. The message under the heading says which.

**Fix:** copy the export from the iPhone again, make sure the file size matches, and press **Try again**. Nothing was saved from a failed import, so an earlier cache stays as it was.

## Import canceled

> Import canceled — No data was saved.

**Cause:** you pressed **Cancel** while the import was running.

**Fix:** none needed. Press **Choose export** to start again; the previous data, if any, is untouched.

## The dashboard says "No data yet"

> No data yet — Export your data in the Health app (Profile → Export All Health Data) and pick the resulting file here.

**Cause:** there is no import yet, or `health-cache.json` is missing from the plugin folder (for example because it is not synced to this device — it is part of the plugin folder, not of your notes).

**Fix:** press **Choose export** and import your export on this device.

## The cached analysis is from an older version

> Health Vitals: the cached analysis is from an older version and needs to be recalculated. Please run the import again.

**Cause:** after an update the plugin changed what it stores per day. Data that is missing in the old cache cannot be reconstructed, so the plugin discards it instead of showing wrong numbers. Your Health export is not affected.

**Fix:** run the import again with your export file (**Choose export**).

## No metrics in the import

> No metrics in the import.

**Cause:** the export was read, but it holds none of the metrics the plugin knows — for example because Health data was switched off for that export or the file is empty.

**Fix:** create a new export in the Health app and import it.

## No data in this range

> No data in this range.

**Cause:** the metric has no values in the period you selected (1M, 3M, 1Y).

**Fix:** switch the period to **All**, or pick another metric. The message "Pick a metric in the overview." appears when no tile was opened yet.

## Nights in grey, "no sleep stages"

> In 54% of nights in this period the device recorded no sleep stages.

**Cause:** this is a note, not an error. Nights recorded before watchOS 9, or with devices that do not track stages, carry no breakdown into deep, core and REM; they stay neutrally coloured.

**Fix:** none. Choose a shorter period to see only the nights that have stages.

## Copying or saving the values failed

> Copy failed

> Save failed: …

**Cause:** *Copy failed* — the system clipboard was not available. *Save failed* — the file could not be written into the folder you typed, the reason follows after the colon (for example an invalid folder name).

**Fix:** for *Save*, pick an existing vault folder in the folder field (it suggests your folders as you type) and try again. An existing file is never overwritten; the plugin appends ` 2`, ` 3` and so on.

## Getting help

Still stuck? [Open an issue](https://github.com/johannes-kaindl/health-vitals/issues) with your Obsidian version, the plugin version (*Settings* → *Community plugins*) and what you expected to happen. Do not attach your health export or `health-cache.json` — describe the problem instead.
