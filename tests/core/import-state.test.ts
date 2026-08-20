import {
  IDLE, started, progressed, phaseChanged, finished, aborted, failed, canAbort,
} from "../../src/core/import-state";

describe("import-state", () => {
  it("startet im Leerlauf und geht mit dem Dateinamen in den Lauf", () => {
    expect(IDLE).toEqual({ status: "idle" });
    expect(started("Export.zip", "unzipping")).toEqual({
      status: "running", phase: "unzipping", records: 0, fileName: "Export.zip",
    });
  });

  // Eine direkt gewählte .xml durchläuft nie eine Entpack-Phase — der Aufrufer
  // (import-controller.ts) startet sie daher direkt in "parsing".
  it("startet eine .xml direkt in der Phase parsing, ohne unzipping", () => {
    expect(started("Export.xml", "parsing")).toEqual({
      status: "running", phase: "parsing", records: 0, fileName: "Export.xml",
    });
  });

  it("zählt Records und wechselt Phasen, ohne den Dateinamen zu verlieren", () => {
    const s1 = progressed(started("Export.zip", "unzipping"), 250_000);
    expect(s1).toEqual({
      status: "running", phase: "unzipping", records: 250_000, fileName: "Export.zip",
    });
    const s2 = phaseChanged(s1, "parsing");
    expect(s2).toEqual({
      status: "running", phase: "parsing", records: 250_000, fileName: "Export.zip",
    });
  });

  it("ignoriert Fortschritt und Phasenwechsel, wenn nicht gelaufen wird", () => {
    expect(progressed(IDLE, 5)).toEqual(IDLE);
    expect(phaseChanged(IDLE, "parsing")).toEqual(IDLE);
  });

  it("schließt mit Erfolg, Abbruch oder Fehler ab", () => {
    expect(finished(started("Export.zip", "unzipping"), 5_719_032)).toEqual({ status: "done", records: 5_719_032 });
    expect(aborted(started("Export.zip", "unzipping"))).toEqual({ status: "aborted" });
    expect(failed(started("Export.zip", "unzipping"), "kaputt")).toEqual({ status: "failed", message: "kaputt" });
  });

  // Der Abbruch bricht den Stream ab, was in aller Regel noch einen Fehler nach sich zieht.
  // Dieser Fehler darf den Abbruch-Zustand nicht überschreiben — sonst sieht der Nutzer
  // "Import fehlgeschlagen", obwohl er selbst abgebrochen hat.
  it("lässt einen Fehler nach dem Abbruch den Abbruch nicht überschreiben", () => {
    const abortedState = aborted(started("Export.zip", "unzipping"));
    expect(failed(abortedState, "stream closed")).toEqual({ status: "aborted" });
  });

  it("bricht aus dem Leerlauf heraus nicht ab", () => {
    expect(aborted(IDLE)).toEqual(IDLE);
  });

  // Symmetrisch zu failed(): Wird während des abschließenden Schreibens abgebrochen,
  // darf ein danach ankommendes finished() den Abbruch-Zustand nicht überschreiben —
  // sonst meldet die UI einen Erfolg, den der Nutzer bereits abgebrochen gesehen hat.
  it("lässt einen Erfolg nach dem Abbruch den Abbruch nicht überschreiben", () => {
    const abortedState = aborted(started("Export.zip", "unzipping"));
    expect(finished(abortedState, 5_719_032)).toEqual({ status: "aborted" });
  });

  // Die drei Fälle unten sind mit dem Umstieg auf `vendor/kit/run-state.ts` (Kit 0.27.0)
  // NEU — vorher lieferte jeder von ihnen einen anderen Zustand. Sie standen bis dahin nur
  // in der Commit-Message: kein Test erreichte sie, und über den echten Code-Pfad tut es
  // heute auch keine Aufrufstelle. Genau deshalb sind sie hier festgenagelt — sonst fällt
  // ein Rückbau (ein `abortableIn`, das verlorengeht; ein Re-Vendor auf eine Fassung ohne
  // die running-Invariante) durch ein grünes Gate.
  //
  // Regel 2: die Schreibphase ist der Punkt ohne Wiederkehr. Der verweigerte Abbruch ist
  // ein No-op, kein Zustandswechsel — `prev` kommt IDENTISCH zurück (Kit-Vertrag, `toBe`).
  it("verweigert den Abbruch in der Schreibphase und gibt den Lauf identisch zurück", () => {
    const writing = phaseChanged(started("Export.zip", "parsing"), "writing");
    expect(canAbort(writing)).toBe(false);
    expect(aborted(writing)).toBe(writing);
  });

  // `canAbort` ist dasselbe Prädikat, das der Abbrechen-Knopf (`tabs/import.ts`) und der
  // Controller-Guard (`import-controller.ts::abort`) benutzen — die UI kann nicht anders
  // urteilen als der Automat.
  it("erlaubt den Abbruch in jeder Phase vor dem Schreiben, aber nicht im Leerlauf", () => {
    expect(canAbort(started("Export.zip", "unzipping"))).toBe(true);
    expect(canAbort(started("Export.xml", "parsing"))).toBe(true);
    expect(canAbort(IDLE)).toBe(false);
  });

  it("erzeugt kein done aus einem nicht-laufenden Zustand", () => {
    expect(finished(IDLE, 5)).toBe(IDLE);
  });

  it("lässt einen Folgefehler ein fertiges Ergebnis nicht überschreiben", () => {
    const done = finished(started("Export.zip", "unzipping"), 5_719_032);
    expect(failed(done, "stream closed")).toBe(done);
  });
});
