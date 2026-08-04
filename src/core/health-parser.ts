import type { StartTag } from "./xml-tokenizer";

export interface RecordEvent {
  kind: "record";
  type: string;
  unit: string;
  startDate: string;
  endDate: string;
  value: number | null;
  /**
   * Der rohe `value`-String, wenn er keine Zahl ist — bei Kategorie-Records steht
   * dort die eigentliche Aussage ("…SleepAnalysisInBed" vs "…AsleepDeep"). Früher
   * fiel sie ersatzlos weg, weil `value` beim Parsen zu `null` wurde: Schlafphasen
   * und Liegezeit waren dadurch ununterscheidbar und wurden aufaddiert.
   */
  categoryValue: string | null;
}

export interface WorkoutEvent {
  kind: "workout";
  activityType: string;
  startDate: string;
  endDate: string;
  duration: number;
}

export type HealthEvent = RecordEvent | WorkoutEvent;

export function eventFromTag(tag: StartTag): HealthEvent | null {
  const a = tag.attrs;
  if (tag.name === "Record") {
    if (!a.type || !a.startDate) return null;
    const raw = a.value === undefined || a.value.trim() === "" ? null : a.value;
    const value = raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : null;
    return {
      kind: "record",
      type: a.type,
      unit: a.unit ?? "",
      startDate: a.startDate,
      endDate: a.endDate ?? a.startDate,
      value,
      // Nur der nicht-numerische Fall: bei Mengen-Records wäre der Rohstring eine
      // Dublette der Zahl und würde bei Millionen Records nur Speicher kosten.
      categoryValue: value === null ? raw : null,
    };
  }
  if (tag.name === "Workout") {
    if (!a.workoutActivityType || !a.startDate) return null;
    const dur = Number(a.duration);
    return {
      kind: "workout",
      activityType: a.workoutActivityType,
      startDate: a.startDate,
      endDate: a.endDate ?? a.startDate,
      duration: Number.isFinite(dur) ? dur : 0,
    };
  }
  return null;
}
