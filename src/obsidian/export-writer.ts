import type { App } from "obsidian";
import { sanitizeBase } from "../core/export-path";
import { joinVaultPath, normalizeVaultDir } from "../vendor/kit/vault-path";

/**
 * Schreibt den Export ins Vault und gibt den tatsächlich benutzten Pfad zurück.
 * Zählweise übernommen aus `obsidian-paperize/src/obsidian/output.ts`
 * (resolveVersionedOutputPath).
 *
 * Es wird NIE überschrieben: Ein Export ist eine Momentaufnahme, und ein zweiter
 * Export desselben Zeitraums darf den ersten nicht stillschweigend ersetzen.
 * Die Schleife terminiert, weil jeder Durchlauf einen anderen Namen erzeugt.
 */
export async function writeExport(
  app: App, folder: string, baseName: string, ext: string, content: string,
): Promise<string> {
  const adapter = app.vault.adapter;
  // `dir` wird gleich fuer exists/mkdir gebraucht; joinVaultPath normalisiert daneben
  // selbst — die frueher hier inline getragene Rechnung steht jetzt einmal im Kit-Modul.
  const dir = normalizeVaultDir(folder);
  if (dir && !(await adapter.exists(dir))) await adapter.mkdir(dir);

  const safe = sanitizeBase(baseName);
  let path = joinVaultPath(dir, `${safe}.${ext}`);
  let n = 2;
  while (await adapter.exists(path)) {
    path = joinVaultPath(dir, `${safe} ${n}.${ext}`);
    n++;
  }
  await adapter.write(path, content);
  return path;
}
