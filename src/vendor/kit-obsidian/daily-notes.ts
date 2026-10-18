// vendored from obsidian-kit@0.63.0, src/obsidian/daily-notes.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { normalizePath } from "obsidian";
import { callableMoment } from "./moment";

/** Ordner und Datumsformat des Kern-Plugins „Daily notes“. */
export interface DailyNotesConfig { folder: string; format: string }

/** Was das Kern-Plugin selbst annimmt, wenn nichts gesetzt ist: Vault-Wurzel und `YYYY-MM-DD`. */
export const DAILY_NOTES_DEFAULT_FORMAT = "YYYY-MM-DD";
export const DAILY_NOTES_DEFAULTS: Readonly<DailyNotesConfig> = Object.freeze({ folder: "", format: DAILY_NOTES_DEFAULT_FORMAT });

/** Ordner und Format des Kern-Plugins „Daily notes“, oder `null`, wenn es (oder seine interne API) nicht erreichbar ist. Wirft nie.
 *
 *  Die API (`app.internalPlugins`) ist intern und undokumentiert, deshalb defensiv gelesen: jedes fehlende Zwischenglied und jede
 *  Ausnahme ergibt `null`. `null` sagt „nicht lesbar“ — ein Plugin, das die Werte nur übernehmen will, wenn es sie gibt (kuro-gamification
 *  beim Erst-Start), prüft darauf; ein Plugin, das immer einen Pfad braucht (health-vitals), nimmt `?? DAILY_NOTES_DEFAULTS`.
 *
 *  Ist das Kern-Plugin lesbar, aber ein Wert ungesetzt, gilt, was Obsidian selbst annimmt: Ordner leer (Vault-Wurzel), Format
 *  `YYYY-MM-DD`. Beide Werte sind getrimmt; ein Nicht-String zählt als ungesetzt.
 *
 *  **Grenze:** gelesen wird nur das Kern-Plugin. Ist das Community-Plugin „Periodic Notes“ aktiv, kann dessen Einstellung (`periodic-notes/daily-notes.json`)
 *  von der des Kern-Plugins abweichen; beide Träger (health-vitals, kuro-gamification) hatten diese Lücke schon. */
export function readDailyNotesConfig(app: unknown): DailyNotesConfig | null {
  try {
    const internal = (app as {
      internalPlugins?: { getPluginById?: (id: string) => { instance?: { options?: { folder?: unknown; format?: unknown } } } | null };
    } | null | undefined)?.internalPlugins;
    const options = internal?.getPluginById?.("daily-notes")?.instance?.options;
    if (options === undefined || options === null || typeof options !== "object") return null;
    const folder = typeof options.folder === "string" ? options.folder.trim() : "";
    const format = typeof options.format === "string" && options.format.trim() !== "" ? options.format.trim() : DAILY_NOTES_DEFAULT_FORMAT;
    return { folder, format };
  } catch {
    return null;
  }
}

/** Vault-Pfad der Daily Note von `date` (Ortszeit): `<Ordner>/<Datum im Format>.md`, normalisiert. Das Format darf Schrägstriche tragen
 *  (`YYYY/MM/YYYY-MM-DD`); dann entstehen Unterordner. Ein leeres Format fällt auf den Default (wie Obsidian). */
export function dailyNotePath(config: DailyNotesConfig, date: Date): string {
  const format = config.format.trim() === "" ? DAILY_NOTES_DEFAULT_FORMAT : config.format;
  const name = callableMoment(date).format(format);
  const folder = config.folder.trim();
  return normalizePath(folder === "" ? `${name}.md` : `${folder}/${name}.md`);
}
