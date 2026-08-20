/**
 * Namensbau für den Werte-Export. Die Kollisionszählung selbst lebt bewusst NICHT hier,
 * weil sie `adapter.exists` awaiten muss und dieser Kern obsidian-frei bleibt.
 *
 * Das Fügen vault-relativer Fragmente (früher `joinPath` hier) kommt seit Kit 0.27.0 aus
 * `vendor/kit/vault-path.ts` (`joinVaultPath`/`normalizeVaultDir`).
 *
 * `sanitizeBase` bleibt dagegen ausdrücklich lokal. Die Zeichenklasse hier ist ENGER als
 * die des Kit-Moduls `pure/filename-template.ts` (`[\\/:*?"<>|#^[\]]`, dazu Ersatz durch
 * `_` statt Entfernen) — ein Umstieg benennte still bestehende Exportdateien um. Das Kit
 * sagt das selbst: die `sanitizeBase`-Familie ist dort ein eigener, noch offener Kandidat
 * und „darf hier nicht mit hineingezogen werden" (`filename-template.ts:39–41`).
 */

export function sanitizeBase(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "Export";
}

/** Basename ohne Endung. `from`/`to` sind die Schlüssel des ersten und letzten
 *  tatsächlich vorhandenen Punkts — der Name beschreibt damit die enthaltenen
 *  Daten, nicht den angeforderten Zeitraum. */
export function buildExportName(metricName: string, from: string, to: string): string {
  return sanitizeBase(`${metricName} ${from}–${to}`);
}
