import { localeTag } from "../i18n/strings";
import { t } from "../vendor/kit/i18n";
import type { Granularity } from "./rollup";
import type { Policy } from "./types";

export function formatValue(n: number, unit: string): string {
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const num = rounded.toLocaleString(localeTag());
  return unit ? `${num} ${unit}` : num;
}

// Dauer in Minuten (evtl. mit Nachkommastellen) → lesbar: "X min", "Xh Ym", "X h".
//
// Ab einem Tag entfallen die Minuten. Eine Jahressumme Schlaf sind gut 100.000
// Minuten; als "1799h 12m" ausgeschrieben behauptet die Anzeige eine Genauigkeit,
// die bei dieser Größenordnung niemanden interessiert, und wird dabei unlesbar.
const MINUTES_PER_DAY = 1440;

export function formatDuration(min: number): string {
  const total = Math.round(min);
  if (total === 0) return min > 0 ? "< 1 min" : "0 min";
  if (total < 60) return `${total} min`;
  if (total < MINUTES_PER_DAY) return `${Math.floor(total / 60)}h ${total % 60}m`;
  return `${Math.round(total / 60).toLocaleString(localeTag())} h`;
}

/**
 * Der Wert einer Metrik in der Form, die zu ihrer Policy passt.
 *
 * `duration`-Serien tragen Minuten. Sie als nackte Zahl mit Einheit auszugeben
 * ("107.952 min") ist zwar korrekt, aber für Menschen unbrauchbar — und auf einer
 * Achse ohne Einheit sogar irreführend: "3.608" liest sich im Deutschen wie eine
 * Dezimalzahl, obwohl der Punkt hier Tausender trennt.
 *
 * Gilt bewusst NICHT für den CSV-Export — der braucht den Rohwert (siehe `rawCell`
 * in view-model.ts).
 */
export function formatByPolicy(n: number, unit: string, policy: Policy): string {
  return policy === "duration" ? formatDuration(n) : formatValue(n, unit);
}

/**
 * Wie `formatByPolicy`, aber für Achsenbeschriftungen: Die Null trägt dort keine
 * Einheit. Sonst steht "0 min" unter "30 h" und "60 h" — die Achse behauptet damit
 * einen Einheitenwechsel, den es nicht gibt, und der kleinste Wert sieht aus, als
 * gehöre er zu einer anderen Skala als der Rest.
 */
export function formatAxisTick(n: number, unit: string, policy: Policy): string {
  if (policy === "duration" && Math.round(n) === 0) return "0";
  return formatByPolicy(n, unit, policy);
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
    // Ohne die Prüfung liefert indexOf() bei einem Schlüssel ohne "W" den Wert -1, slice(0)
    // gibt den ganzen Schlüssel zurück und Number() daraus NaN — auf der Achse stünde dann
    // "KW NaN". Heute erzeugt nur isoWeekKey() diese Schlüssel, die Kette ist also
    // geschlossen; der rohe Schlüssel als Rückfallebene ist trotzdem lesbar statt sinnlos.
    const marker = key.indexOf("W");
    const week = marker < 0 ? NaN : Number(key.slice(marker + 1));
    return Number.isFinite(week) ? `${t("axis.week")} ${week}` : key;
  }
  if (g === "month") {
    // Monat und Jahr GETRENNT formatieren: in einem Aufruf kombiniert wählt ICU
    // im Deutschen ein längeres Muster ("Sept. 26" statt "Sep 26"), was bei fünf
    // Labels nebeneinander in einer schmalen Sidebar überlappt.
    const d = new Date(`${key}-01T00:00:00Z`);
    const month = d.toLocaleDateString(localeTag(), { month: "short", timeZone: "UTC" });
    const year = d.toLocaleDateString(localeTag(), { year: "2-digit", timeZone: "UTC" });
    return `${month} ${year}`;
  }
  return new Date(`${key}T00:00:00Z`).toLocaleDateString(localeTag(), {
    day: "2-digit", month: "2-digit", timeZone: "UTC",
  });
}
