/**
 * Pfad- und Namensbau für den Werte-Export. Übernommen aus
 * `obsidian-paperize/src/obsidian/output.ts` und `epub-exporter/src/core/output-path.ts`
 * (dort byte-nah identisch). Die Kollisionszählung selbst lebt bewusst NICHT hier,
 * weil sie `adapter.exists` awaiten muss und dieser Kern obsidian-frei bleibt.
 */

export function sanitizeBase(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "").trim();
  return cleaned || "Export";
}

/** Fügt zwei vault-relative Fragmente ohne Slash-Rauschen zusammen. */
export function joinPath(dir: string, file: string): string {
  const d = (dir || "").replace(/^\/+|\/+$/g, "");
  return d ? `${d}/${file}` : file;
}

/** Basename ohne Endung. `from`/`to` sind die Schlüssel des ersten und letzten
 *  tatsächlich vorhandenen Punkts — der Name beschreibt damit die enthaltenen
 *  Daten, nicht den angeforderten Zeitraum. */
export function buildExportName(metricName: string, from: string, to: string): string {
  return sanitizeBase(`${metricName} ${from}–${to}`);
}
