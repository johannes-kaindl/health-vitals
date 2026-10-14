import type { Granularity, RangeKey } from "./rollup";
import type { HealthCache } from "./types";

/** Was ein ```health-vitals-Block anzeigt: Verlauf, Kennzahlen oder Werte-Tabelle. */
export type BlockKind = "chart" | "value" | "table";

export interface BlockSpec {
  /** Kurzform oder voller Identifier, wie geschrieben — aufgelöst wird gegen den Cache. */
  metric: string;
  range: RangeKey;
  /** Fehlt: die Voreinstellung des Zeitraums (Tag/Woche/Monat). */
  rollup?: Granularity;
  kind: BlockKind;
}

/** Ein Problem in einem Block, als Schlüssel plus Argumente für `t()` — der Block zeigt es als
 *  lesbare Zeile im Block selbst, nie als Notice (sie verschwände und ließe einen leeren Kasten). */
export interface BlockProblem { key: string; args: string[] }

export interface BlockParse {
  /** `null`, wenn nicht gerendert werden kann (siehe `errors`). */
  spec: BlockSpec | null;
  errors: BlockProblem[];
  /** Blockieren nicht (unbekannte Schlüssel). */
  warnings: BlockProblem[];
}

const KEY_LINE = /^([A-Za-z][A-Za-z0-9_-]*)\s*:(.*)$/;
const RANGES: Record<string, RangeKey> = { "1m": "1M", "3m": "3M", "1y": "1Y", all: "all" };
const ROLLUPS: Record<string, Granularity> = { day: "day", week: "week", month: "month" };
const KINDS: Record<string, BlockKind> = { chart: "chart", value: "value", table: "table" };

function stripQuotes(value: string): string {
  const v = value.trim();
  const quoted = (v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"));
  return quoted && v.length >= 2 ? v.slice(1, -1).trim() : v;
}

/** Quelltext eines ```health-vitals-Blocks → Spezifikation. Zeilen `schlüssel: wert`, Leerzeilen
 *  und `#`-Zeilen werden übersprungen; ein Wert, den es nicht gibt, blockiert (statt still den
 *  Standard zu nehmen — ein Tippfehler in `range` soll auffallen, nicht ein falsches Chart zeigen). */
export function parseBlockSpec(source: string): BlockParse {
  const errors: BlockProblem[] = [];
  const warnings: BlockProblem[] = [];
  let metric: string | undefined;
  let range: RangeKey = "3M";
  let rollup: Granularity | undefined;
  let kind: BlockKind = "chart";

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = KEY_LINE.exec(line);
    if (!m) { errors.push({ key: "block.badLine", args: [line] }); continue; }
    const key = m[1].toLowerCase();
    const value = stripQuotes(m[2]);
    const lower = value.toLowerCase();
    if (key === "metric") {
      metric = value;
    } else if (key === "range") {
      const r = RANGES[lower];
      if (r) range = r; else errors.push({ key: "block.badRange", args: [value] });
    } else if (key === "rollup") {
      const g = ROLLUPS[lower];
      if (g) rollup = g; else errors.push({ key: "block.badRollup", args: [value] });
    } else if (key === "kind") {
      const k = KINDS[lower];
      if (k) kind = k; else errors.push({ key: "block.badKind", args: [value] });
    } else {
      warnings.push({ key: "block.unknownKey", args: [m[1]] });
    }
  }

  if (metric === undefined || metric === "") errors.push({ key: "block.noMetric", args: [] });
  if (errors.length > 0 || metric === undefined) return { spec: null, errors, warnings };
  return { spec: { metric, range, rollup, kind }, errors, warnings };
}

/** Kurzform (`StepCount`) oder Identifier → Schlüssel einer Serie im Cache; Groß-/Kleinschreibung
 *  ist egal. `null`, wenn der Export die Metrik nicht trägt. */
export function resolveMetricId(cache: HealthCache, name: string): string | null {
  const ids = Object.keys(cache.metrics);
  const wanted = name.trim().toLowerCase();
  const prefixes = ["", "hkquantitytypeidentifier", "hkcategorytypeidentifier"];
  for (const p of prefixes) {
    const hit = ids.find((id) => id.toLowerCase() === p + wanted);
    if (hit) return hit;
  }
  return null;
}
