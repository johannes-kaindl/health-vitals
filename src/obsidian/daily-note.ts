import { TFile, type App } from "obsidian";
import { dailyValues } from "../core/daily-values";
import type { HealthCache } from "../core/types";
import { mergeMissing } from "../vendor/kit/merge-missing";
import { localDate } from "../vendor/kit/local-stamp";
import { DAILY_NOTES_DEFAULTS, dailyNotePath, readDailyNotesConfig } from "../vendor/kit-obsidian/daily-notes";

export type DailyWriteResult =
  | { status: "written"; path: string; keys: string[] }
  | { status: "nothing-new"; path: string }
  | { status: "no-note"; path: string }
  | { status: "no-values"; day: string };

/**
 * Schreibt die Tageswerte des Caches in die Daily Note von `now`. Legt keine Notiz an, fasst nur
 * die eigenen `health_*`-Felder an und lässt vorhandene Werte stehen (`processFrontMatter`
 * schreibt das Frontmatter, nicht den Text darunter).
 */
export async function writeDailyValues(app: App, cache: HealthCache, now: Date): Promise<DailyWriteResult> {
  const day = localDate(now);
  const values = dailyValues(cache, day);
  if (Object.keys(values).length === 0) return { status: "no-values", day };
  const path = dailyNotePath(readDailyNotesConfig(app) ?? DAILY_NOTES_DEFAULTS, now);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { status: "no-note", path };
  let keys: string[] = [];
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    keys = mergeMissing(fm, values);
  });
  return keys.length > 0 ? { status: "written", path, keys } : { status: "nothing-new", path };
}
