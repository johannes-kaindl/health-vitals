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
    const num = a.value !== undefined ? Number(a.value) : NaN;
    return {
      kind: "record",
      type: a.type,
      unit: a.unit ?? "",
      startDate: a.startDate,
      endDate: a.endDate ?? a.startDate,
      value: Number.isFinite(num) ? num : null,
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
