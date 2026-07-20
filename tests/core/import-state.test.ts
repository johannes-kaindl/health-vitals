import {
  IDLE, started, progressed, phaseChanged, finished, aborted, failed,
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
});
