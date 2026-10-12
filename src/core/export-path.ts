import { sanitizeBase as sanitizeBaseKit } from "../vendor/kit/filename-template";

/**
 * Namensbau für den Werte-Export. Die Kollisionszählung selbst lebt bewusst NICHT hier,
 * weil sie `adapter.exists` awaiten muss und dieser Kern obsidian-frei bleibt.
 *
 * Das Fügen vault-relativer Fragmente (früher `joinPath` hier) kommt seit Kit 0.27.0 aus
 * `vendor/kit/vault-path.ts` (`joinVaultPath`/`normalizeVaultDir`).
 *
 * `sanitizeBase` steht seit Kit code-kit 0.24.0 im Kit (`filename-template`), hier nur mit dem
 * Fallback „Export“. Es ist ausdrücklich NICHT `sanitizeFilename`: dessen Zeichenklasse ist
 * weiter (`[\\/:*?"<>|#^[\]]`) und ersetzt durch `_` statt zu entfernen — ein Umstieg
 * benennte still bestehende Exportdateien um.
 */

export function sanitizeBase(name: string): string {
  return sanitizeBaseKit(name, "Export");
}

/** Basename ohne Endung. `from`/`to` sind die Schlüssel des ersten und letzten
 *  tatsächlich vorhandenen Punkts — der Name beschreibt damit die enthaltenen
 *  Daten, nicht den angeforderten Zeitraum. */
export function buildExportName(metricName: string, from: string, to: string): string {
  return sanitizeBase(`${metricName} ${from}–${to}`);
}
