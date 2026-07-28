import { localeTag } from "../i18n/strings";
import { t } from "../vendor/kit/i18n";
import type { Granularity } from "./rollup";

export function formatValue(n: number, unit: string): string {
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const num = rounded.toLocaleString(localeTag());
  return unit ? `${num} ${unit}` : num;
}

// Dauer in Minuten (evtl. mit Nachkommastellen) → lesbar: "X min" bzw. "Xh Ym".
export function formatDuration(min: number): string {
  const total = Math.round(min);
  if (total === 0) return min > 0 ? "< 1 min" : "0 min";
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

/**
 * Achsenbeschriftung aus einem RollupPoint-Schlüssel.
 *   day   "2026-07-28" → "28.07." (de) / "07/28" (en)
 *   week  "2026-W30"   → "KW 30"  (de) / "W 30"  (en)
 *   month "2026-07"    → "Jul 26"
 *
 * `timeZone: "UTC"` ist load-bearing, nicht kosmetisch: Die Schlüssel stehen für
 * UTC-Mitternacht. Ohne die Option formatiert Node sie in der lokalen Zone — in
 * jeder Zone westlich von Greenwich rutscht damit jedes Label einen Tag zurück,
 * und am Monatsersten sogar in den Vormonat.
 */
export function formatTickLabel(key: string, g: Granularity): string {
  if (g === "week") {
    const week = Number(key.slice(key.indexOf("W") + 1));
    return `${t("axis.week")} ${week}`;
  }
  if (g === "month") {
    return new Date(`${key}-01T00:00:00Z`).toLocaleDateString(localeTag(), {
      month: "short", year: "2-digit", timeZone: "UTC",
    });
  }
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(localeTag(), {
    day: "2-digit", month: "2-digit", timeZone: "UTC",
  });
}
