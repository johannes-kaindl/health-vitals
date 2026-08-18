import type { StartTag, Token } from "./xml-tokenizer";
import { toKcal, toKm, toMinutes } from "./units";

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
  /** Summe aller `…Distance*`-Statistics des Workouts, in km. Fehlt, wenn der Export
   *  keine trägt (Yoga) oder die Einheit unbekannt war. */
  distanceKm?: number;
  /** `ActiveEnergyBurned` in kcal — ohne Grundumsatz. */
  energyKcal?: number;
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
  return null;
}

/** Tag-Name des Workout-Rahmens. */
const WORKOUT_TAG = "Workout";
/** Kennzahl-Kind eines Workouts, z. B. Distanz oder aktive Energie. */
const STATS_TAG = "WorkoutStatistics";
const ENERGY_TYPE = "HKQuantityTypeIdentifierActiveEnergyBurned";

/**
 * Liest den Token-Strom zu Ereignissen.
 *
 * Records sind zustandslos deutbar, Workouts nicht: Ihre Kennzahlen liegen in
 * `<WorkoutStatistics>`-Kindern, und die sind nur im Rahmen des offenen `<Workout>`
 * zuzuordnen. Deshalb entsteht das Workout-Ereignis erst beim `</Workout>` — wer den
 * Rahmen nie schliesst (abgeschnittene Datei), bekommt kein Ereignis, denn seine
 * Kennzahlen wären unvollständig.
 */
export class EventReader {
  private offen: WorkoutEvent | null = null;

  push(tok: Token): HealthEvent | null {
    if (tok.kind === "end") {
      if (tok.name !== WORKOUT_TAG) return null;
      const fertig = this.offen;
      this.offen = null;
      return fertig;
    }

    if (tok.name === WORKOUT_TAG) {
      const w = workoutFromTag(tok);
      if (tok.selfClosing) { this.offen = null; return w; }
      this.offen = w;
      return null;
    }

    if (tok.name === STATS_TAG) {
      if (this.offen) addStatistic(this.offen, tok);
      return null;
    }

    // Übrige Kindelemente eines offenen Rahmens (MetadataEntry, WorkoutEvent, ...) sind
    // hier noch stumm — `eventFromTag` kennt bislang nur "Record" und liefert für sie
    // von selbst `null`. Records bleiben dabei zustandslos deutbar, auch innerhalb eines
    // offenen Workouts.
    return eventFromTag(tok);
  }
}

function workoutFromTag(tag: StartTag): WorkoutEvent | null {
  const a = tag.attrs;
  if (!a.workoutActivityType || !a.startDate) return null;
  // Einheit lesen statt Minuten annehmen: `durationUnit` steht an jedem Workout.
  const min = toMinutes(Number(a.duration), a.durationUnit ?? "min");
  return {
    kind: "workout",
    activityType: a.workoutActivityType,
    startDate: a.startDate,
    endDate: a.endDate ?? a.startDate,
    duration: min ?? 0,
  };
}

/**
 * Eine Kennzahl in das offene Workout übernehmen.
 *
 * Nur `sum` wird gelesen: `HeartRate` trägt stattdessen average/minimum/maximum, und
 * ein Mittelwert liesse sich nicht sinnvoll zu einer Tages- oder Monatssumme addieren.
 */
function addStatistic(w: WorkoutEvent, tag: StartTag): void {
  const a = tag.attrs;
  if (a.sum === undefined || !a.type) return;
  const sum = Number(a.sum);
  const unit = a.unit ?? "";

  if (a.type.includes("Distance")) {
    const km = toKm(sum, unit);
    if (km !== null) w.distanceKm = (w.distanceKm ?? 0) + km;
    return;
  }
  if (a.type === ENERGY_TYPE) {
    const kcal = toKcal(sum, unit);
    if (kcal !== null) w.energyKcal = (w.energyKcal ?? 0) + kcal;
  }
}
