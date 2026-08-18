/**
 * Umrechnung der Einheiten, die Apple Health an Werten mitliefert.
 *
 * Die Einheit steht an jedem Element (`unit`, `durationUnit`) und richtet sich nach der
 * Systemeinstellung des Nutzers — ein Export aus den USA trägt Meilen. Sie zu ignorieren
 * hiesse, jede Distanz eines solchen Exports um 61 % zu untertreiben.
 *
 * Unbekanntes ergibt `null`, nie einen ungeprüften Rohwert: Eine fehlende Zahl ist im
 * Dashboard als "—" sichtbar, eine falsche Zahl sieht wie eine Messung aus.
 */

const KM_PER: Record<string, number> = { km: 1, m: 0.001, mi: 1.609344, yd: 0.0009144, ft: 0.0003048 };
const KCAL_PER: Record<string, number> = { kcal: 1, cal: 1, kj: 1 / 4.184 };
const MIN_PER: Record<string, number> = { min: 1, s: 1 / 60, sec: 1 / 60, h: 60, hr: 60 };

function convert(value: number, unit: string, table: Record<string, number>): number | null {
  if (!Number.isFinite(value)) return null;
  const factor = table[unit.trim().toLowerCase()];
  return factor === undefined ? null : value * factor;
}

export function toKm(value: number, unit: string): number | null {
  return convert(value, unit, KM_PER);
}

export function toKcal(value: number, unit: string): number | null {
  return convert(value, unit, KCAL_PER);
}

export function toMinutes(value: number, unit: string): number | null {
  return convert(value, unit, MIN_PER);
}
