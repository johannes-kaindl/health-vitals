import { makeRunState, type RunState } from "../vendor/kit/run-state";

/**
 * Duenner Adapter ueber `vendor/kit/run-state.ts`. Der Automat selbst — die diskriminierte
 * Union und die sechs totalen Uebergaenge — steht dort; hier liegen nur die repo-eigenen
 * Namen und Aritaeten (`started(fileName, phase)`, `progressed(prev, records)`,
 * `phaseChanged(prev, phase)`, `finished(prev, records)`), damit keine Aufrufstelle
 * umgeschrieben werden muss. Das Kit hat bewusst EIN `progress(prev, patch)` statt dieser
 * drei — die Uebersetzung ist genau das, was ein Adapter tut.
 *
 * Regel 2 („die Schreibphase ist der Punkt ohne Wiederkehr") stand bis hierher zweimal
 * ausserhalb des Automaten: im Controller (`abort()`) und in der UI (Abbrechen-Knopf).
 * Sie steht jetzt einmal, in `abortableIn` — `canAbort` ist dasselbe Praedikat, das auch
 * `aborted()` benutzt, die UI kann also nicht anders urteilen als der Automat.
 */

/** Phasen eines Import-Laufs. `unzipping` entfällt bei einer direkt gewählten .xml. */
export type ImportPhase = "unzipping" | "parsing" | "writing";

export type ImportState = RunState<
  ImportPhase,
  { records: number; fileName: string },
  { records: number }
>;

const run = makeRunState<ImportPhase, { records: number; fileName: string }, { records: number }>({
  // Schreiben ist der Punkt ohne Umkehr — Begruendung an der Aufrufstelle
  // (`obsidian/import-controller.ts`, Kommentar ueber `abort()`).
  abortableIn: (phase) => phase !== "writing",
  // `onPhaseChange` bewusst nicht gesetzt: apple-health setzt bei einem Phasenwechsel
  // nichts zurueck — der Record-Zaehler laeuft ueber alle Phasen hinweg weiter.
});

export const IDLE: ImportState = run.IDLE;

export function started(fileName: string, phase: ImportPhase): ImportState {
  return run.begin(phase, { records: 0, fileName });
}

export function progressed(prev: ImportState, records: number): ImportState {
  return run.progress(prev, { records });
}

export function phaseChanged(prev: ImportState, phase: ImportPhase): ImportState {
  return run.progress(prev, { phase });
}

export function finished(prev: ImportState, records: number): ImportState {
  return run.finish(prev, { records });
}

export function aborted(prev: ImportState): ImportState {
  return run.abort(prev);
}

export function failed(prev: ImportState, message: string): ImportState {
  return run.fail(prev, message);
}

/** Darf jetzt abgebrochen werden? Dasselbe Praedikat, das `aborted()` intern benutzt —
 *  fuer den Abbrechen-Knopf (`obsidian/tabs/import.ts`) und den Controller-Guard.
 *  Weitergereicht als Funktion statt als `= run.canAbort`: eine losgeloeste Methode
 *  faellt sonst unter `@typescript-eslint/unbound-method` und bricht das Lint-Gate. */
export function canAbort(state: ImportState): boolean {
  return run.canAbort(state);
}
