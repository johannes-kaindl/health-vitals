import type { StartTag } from "./xml-tokenizer";

export interface RecordEvent {
  kind: "record";
  type: string;
  unit: string;
  startDate: string;
  endDate: string;
  value: number | null;
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
    const value = a.value === undefined || a.value.trim() === ""
      ? null
      : (Number.isFinite(Number(a.value)) ? Number(a.value) : null);
    return {
      kind: "record",
      type: a.type,
      unit: a.unit ?? "",
      startDate: a.startDate,
      endDate: a.endDate ?? a.startDate,
      value,
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
