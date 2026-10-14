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
  /** Minuten; fehlt, wenn das Attribut fehlt, leer ist oder seine Einheit unbekannt war — nie eine erfundene 0. */
  duration?: number;
  /** Summe aller `…Distance*`-Statistics des Workouts, in km. Fehlt, wenn der Export
   *  keine trägt (Yoga) oder die Einheit unbekannt war. */
  distanceKm?: number;
  /** `ActiveEnergyBurned` in kcal — ohne Grundumsatz. */
  energyKcal?: number;
}

/** Ein Tag der Aktivitätsringe (`<ActivitySummary>`). `day` ist ein reines Datum ohne Zeit und
 *  Zone (`dateComponents`) und geht deshalb nicht durch `localDay()`. */
export interface SummaryEvent {
  kind: "summary";
  day: string;
  moveKcal: number; moveGoalKcal: number;
  exerciseMin: number; exerciseGoalMin: number;
  standHours: number; standGoalHours: number;
}

export type HealthEvent = RecordEvent | WorkoutEvent | SummaryEvent;

/** Deutet nur `<Record>`; Workouts entstehen im `EventReader`, weil sie Kindelemente brauchen. */
export function eventFromTag(tag: StartTag): RecordEvent | null {
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
const SUMMARY_TAG = "ActivitySummary";
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
  private open: WorkoutEvent | null = null;

  push(tok: Token): HealthEvent | null {
    if (tok.kind === "end") {
      if (tok.name !== WORKOUT_TAG) return null;
      const done = this.open;
      this.open = null;
      return done;
    }

    if (tok.name === WORKOUT_TAG) {
      const w = workoutFromTag(tok);
      if (tok.selfClosing) { this.open = null; return w; }
      this.open = w;
      return null;
    }

    if (tok.name === STATS_TAG) {
      if (this.open) addStatistic(this.open, tok);
      return null;
    }

    if (tok.name === SUMMARY_TAG) return summaryFromTag(tok);

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
  // Leerstring eigens abfangen: `Number("")` ist 0, keine gemessene Dauer.
  const min = a.duration === undefined || a.duration.trim() === ""
    ? null
    : toMinutes(Number(a.duration), a.durationUnit ?? "min");
  const w: WorkoutEvent = {
    kind: "workout",
    activityType: a.workoutActivityType,
    startDate: a.startDate,
    endDate: a.endDate ?? a.startDate,
  };
  if (min !== null) w.duration = min;
  return w;
}

/**
 * Eine Kennzahl in das offene Workout übernehmen.
 *
 * Nur `sum` wird gelesen: `HeartRate` trägt stattdessen average/minimum/maximum, und
 * ein Mittelwert liesse sich nicht sinnvoll zu einer Tages- oder Monatssumme addieren.
 */
function addStatistic(w: WorkoutEvent, tag: StartTag): void {
  const a = tag.attrs;
  // Leerstring eigens abfangen: `Number("")` ist 0, nicht NaN — ohne diesen Guard
  // wuerde ein Attribut ohne Wert als gemessene Null durchgehen statt als fehlend.
  if (a.sum === undefined || a.sum.trim() === "" || !a.type) return;
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

const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function num(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Ohne lesbaren Tag oder ohne eines der sechs Felder kein Ereignis: ein halber Ring wäre eine
 *  erfundene Null. Energie wird nach kcal umgerechnet (`activeEnergyBurnedUnit`); bei unbekannter
 *  Einheit entfällt der Tag. */
function summaryFromTag(tag: StartTag): SummaryEvent | null {
  const a = tag.attrs;
  if (!a.dateComponents || !DAY_ONLY.test(a.dateComponents)) return null;
  const move = num(a.activeEnergyBurned);
  const moveGoal = num(a.activeEnergyBurnedGoal);
  const unit = a.activeEnergyBurnedUnit ?? "kcal";
  const exercise = num(a.appleExerciseTime);
  const exerciseGoal = num(a.appleExerciseTimeGoal);
  const stand = num(a.appleStandHours);
  const standGoal = num(a.appleStandHoursGoal);
  if (move === null || moveGoal === null || exercise === null || exerciseGoal === null || stand === null || standGoal === null) return null;
  const moveKcal = toKcal(move, unit);
  const moveGoalKcal = toKcal(moveGoal, unit);
  if (moveKcal === null || moveGoalKcal === null) return null;
  return {
    kind: "summary", day: a.dateComponents, moveKcal, moveGoalKcal,
    exerciseMin: exercise, exerciseGoalMin: exerciseGoal, standHours: stand, standGoalHours: standGoal,
  };
}
