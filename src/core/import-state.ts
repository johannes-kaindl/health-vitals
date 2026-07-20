/** Phasen eines Import-Laufs. `unzipping` entfällt bei einer direkt gewählten .xml. */
export type ImportPhase = "unzipping" | "parsing" | "writing";

export type ImportState =
  | { status: "idle" }
  | { status: "running"; phase: ImportPhase; records: number; fileName: string }
  | { status: "done"; records: number }
  | { status: "aborted" }
  | { status: "failed"; message: string };

export const IDLE: ImportState = { status: "idle" };

export function started(fileName: string, phase: ImportPhase): ImportState {
  return { status: "running", phase, records: 0, fileName };
}

export function progressed(prev: ImportState, records: number): ImportState {
  return prev.status === "running" ? { ...prev, records } : prev;
}

export function phaseChanged(prev: ImportState, phase: ImportPhase): ImportState {
  return prev.status === "running" ? { ...prev, phase } : prev;
}

/**
 * Symmetrisch zu `failed()`: Ein Abbruch, der während des abschließenden Schreibens
 * eintrifft, darf nicht nachträglich mit "done" überschrieben werden — sonst meldet
 * die UI einen Erfolg, den der Nutzer bereits abgebrochen gesehen hat.
 */
export function finished(prev: ImportState, records: number): ImportState {
  return prev.status === "aborted" ? prev : { status: "done", records };
}

export function aborted(prev: ImportState): ImportState {
  return prev.status === "running" ? { status: "aborted" } : prev;
}

/**
 * Ein Abbruch reißt den Stream ab und erzeugt dabei fast immer noch einen Folgefehler.
 * Der darf den Abbruch nicht überschreiben, sonst meldet die UI ein Scheitern, wo der
 * Nutzer selbst gestoppt hat.
 */
export function failed(prev: ImportState, message: string): ImportState {
  return prev.status === "aborted" ? prev : { status: "failed", message };
}
