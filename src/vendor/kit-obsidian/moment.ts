// vendored from obsidian-kit@0.63.0, src/obsidian/moment.ts — do not hand-edit; re-vendor via tools/sync-kit.sh
import { moment } from "obsidian";

/** Das, was an einem `moment`-Wert gebraucht wird. Bewusst klein: wer mehr braucht (`add`, `diff` …), erweitert diese Schnittstelle hier,
 *  statt im Plugin erneut zu casten. */
export interface CallableMomentValue {
  isValid(): boolean;
  format(format?: string): string;
  toDate(): Date;
}

/** Die zwei Aufrufformen, die Plugins brauchen: aktuelles/gegebenes Datum und strenges Parsen eines Textes nach Format. */
export interface CallableMoment {
  (input?: Date | number): CallableMomentValue;
  (input: string, format: string, strict: boolean): CallableMomentValue;
}

/** Obsidians `moment`, aufrufbar getypt.
 *
 *  Obsidian typt `moment` als Namespace (`import * as Moment`), ein direkter Aufruf ist damit im Store-Review ein `error`-Typ
 *  (`no-unsafe-*`): kuro-gamification 1.13.0 bekam dafür vier Befunde und „Satisfactory“, behoben in 1.13.1. Zur Laufzeit ist `moment`
 *  die Funktion. Der Zugriff steht deshalb an einer Stelle, nicht in jedem Plugin (vorher drei lokale Casts: `daily-notes.ts`,
 *  health-vitals `daily-note.ts`, kuro-gamification `VaultReader.ts`).
 *
 *  Im Kit-Mock (`testing`) trägt die erste Form eine Teilmenge der Formate, die zweite (Parsen) wirft dort — das Kit parst nicht nach. */
export const callableMoment = moment as unknown as CallableMoment;
