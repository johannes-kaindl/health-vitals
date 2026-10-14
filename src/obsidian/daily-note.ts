import { moment, normalizePath, TFile, type App } from "obsidian";
import { dailyValues } from "../core/daily-values";
import type { HealthCache } from "../core/types";
import { localDate } from "../vendor/kit/local-stamp";

/** Obsidians `moment` ist als Namespace getypt (`import * as Moment`) und damit nicht aufrufbar,
 *  zur Laufzeit aber die Funktion — der Zuschnitt auf das, was hier gebraucht wird, steht an einer Stelle. */
const formatDate = moment as unknown as (d: Date) => { format: (f: string) => string };

export interface DailyNotesConfig { folder: string; format: string }

/** Ordner und Format des Kern-Plugins „Daily notes". Dessen API ist intern und undokumentiert,
 *  deshalb defensiv gelesen: fehlt sie, gelten die Standardwerte des Plugins (Vault-Wurzel, `YYYY-MM-DD`). */
export function readDailyNotesConfig(app: App): DailyNotesConfig {
  let options: { folder?: unknown; format?: unknown } | undefined;
  try {
    const internal = (app as unknown as {
      internalPlugins?: { getPluginById?: (id: string) => { instance?: { options?: { folder?: unknown; format?: unknown } } } | null };
    }).internalPlugins;
    options = internal?.getPluginById?.("daily-notes")?.instance?.options;
  } catch {
    options = undefined;
  }
  const folder = typeof options?.folder === "string" ? options.folder.trim() : "";
  const format = typeof options?.format === "string" && options.format.trim() !== "" ? options.format.trim() : "YYYY-MM-DD";
  return { folder, format };
}

export function dailyNotePath(config: DailyNotesConfig, date: Date): string {
  const name = formatDate(date).format(config.format);
  return normalizePath(config.folder === "" ? `${name}.md` : `${config.folder}/${name}.md`);
}

/**
 * Trägt `values` in `frontmatter` ein — nur, was dort noch fehlt. Ein vorhandener Wert bleibt
 * stehen, auch ein leerer: wer ihn von Hand gesetzt oder korrigiert hat, bekommt ihn nicht
 * zurückgesetzt. Gibt die Schlüssel zurück, die geschrieben wurden.
 * KIT-KANDIDAT (gemeldet an den Master, Dach-Task „Kit-Kandidaten aus Welle 22“): ein reiner, allgemein
 * brauchbarer Helfer „nur fehlende Schlüssel setzen, vorhandene (auch leere) bleiben“ gehört in die Bibliothek.
 * Hier nicht exportiert, weil das Bibliotheks-Gate sonst anhält; die nächste Welle zieht ihn ins Kit.
 */
function mergeMissing(frontmatter: Record<string, unknown>, values: Record<string, number>): string[] {
  const written: string[] = [];
  for (const [key, value] of Object.entries(values)) {
    if (key in frontmatter) continue;
    frontmatter[key] = value;
    written.push(key);
  }
  return written;
}

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
  const path = dailyNotePath(readDailyNotesConfig(app), now);
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { status: "no-note", path };
  let keys: string[] = [];
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    keys = mergeMissing(fm, values);
  });
  return keys.length > 0 ? { status: "written", path, keys } : { status: "nothing-new", path };
}
