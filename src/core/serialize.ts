/**
 * Serialisierung von Kopf + Zeilen in die beiden Exportformate.
 * Der Markdown-Teil kommt aus code-kit `markdown-table` (vorher eigene Kopie, ursprünglich aus
 * `vault-rag/src/reformat_mechanical.ts`); der CSV-Teil ist im Ökosystem das erste Exemplar.
 */
import { renderMarkdownTable } from "../vendor/kit/markdown-table";

export function toMarkdownTable(headers: string[], rows: string[][]): string {
  return renderMarkdownTable(headers, rows);
}

/** Quoting nach RFC 4180: nur wenn nötig, enthaltene Anführungszeichen verdoppelt.
 *  `\r` gehört mit in die Zeichenklasse — ein alleinstehendes Carriage Return ist für
 *  CSV-Parser ein Zeilenende und zerlegt sonst den Datensatz. */
function csvCell(cell: string): string {
  return /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Zeilenende `\n` statt des von RFC 4180 verlangten `\r\n` — Ziel ist ein
 *  Obsidian-Vault, und jede gängige Tabellenkalkulation liest beides. */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
