/**
 * Serialisierung von Kopf + Zeilen in die beiden Exportformate.
 * Der Markdown-Teil ist aus `vault-rag/src/reformat_mechanical.ts` übernommen
 * (renderTable/escapeCell); der CSV-Teil ist im Ökosystem das erste Exemplar.
 */

/** Ein literales `|` muss re-escaped werden, sonst zerfällt die Zelle beim
 *  Rendern in zwei und die Datenzeile hat mehr Spalten als der Kopf. */
function escapeCell(cell: string): string {
  return cell.replace(/\|/g, "\\|");
}

export function toMarkdownTable(headers: string[], rows: string[][]): string {
  const head = `| ${headers.map(escapeCell).join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(escapeCell).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}

/** Quoting nach RFC 4180: nur wenn nötig, enthaltene Anführungszeichen verdoppelt. */
function csvCell(cell: string): string {
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

/** Zeilenende `\n` statt des von RFC 4180 verlangten `\r\n` — Ziel ist ein
 *  Obsidian-Vault, und jede gängige Tabellenkalkulation liest beides. */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
}
