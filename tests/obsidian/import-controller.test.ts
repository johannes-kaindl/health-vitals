import { ImportController, type ImportControllerHost } from "../../src/obsidian/import-controller";
import type { ImportState } from "../../src/core/import-state";
import type { HealthCache } from "../../src/core/types";

const XML = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
  + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';

function hostSpy(): ImportControllerHost & { written: HealthCache[] } {
  const written: HealthCache[] = [];
  return { written, writeCache: (c) => { written.push(c); return Promise.resolve(); } };
}

/**
 * File, dessen stream() hängt, bis `failNow()` aufgerufen wird — dann scheitert
 * der Stream mit einem echten (Nicht-Abbruch-)Fehler. Simuliert den Folgefehler,
 * den ein Stream-Teardown nach einem Abbruch typischerweise noch wirft. `pulled`
 * löst erst auf, wenn reader.read() tatsächlich hängt, damit der Test abort()
 * nicht vor dem ersten Lesezugriff auslöst (siehe health-source.test.ts für die
 * gleiche File-mit-kontrolliertem-stream()-Technik).
 */
function fileWithStreamThatFailsOnDemand(
  name: string,
): { file: File; pulled: Promise<void>; failNow: (e: Error) => void } {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  let markPulled!: () => void;
  const pulled = new Promise<void>((resolve) => { markPulled = resolve; });
  const stream = new ReadableStream<Uint8Array>({
    start(c) { ctrl = c; },
    pull() {
      markPulled();
      return new Promise<void>(() => {}); // hängt, bis failNow() den Stream fehlschlagen lässt
    },
  });
  const file = new File([], name);
  Object.defineProperty(file, "stream", { value: () => stream });
  return { file, pulled, failNow: (e) => ctrl.error(e) };
}

describe("ImportController", () => {
  it("läuft durch, schreibt den Cache und endet in done", async () => {
    const host = hostSpy();
    const states: ImportState[] = [];
    const ctrl = new ImportController(host, (s) => states.push(s));

    await ctrl.start(new File([XML], "Export.xml"));

    expect(ctrl.state).toEqual({ status: "done", records: 1 });
    expect(host.written).toHaveLength(1);
    expect(host.written[0].recordCount).toBe(1);
    expect(states.some((s) => s.status === "running")).toBe(true);
    expect(states.at(-1)).toEqual({ status: "done", records: 1 });
  });

  // Eine direkt gewählte .xml durchläuft nie eine Entpack-Phase — der erste emittierte
  // Zustand muss daher sofort "parsing" sein, nicht das für .zip geltende "unzipping"
  // (siehe Spec: "phase ist eine von drei: unzipping (nur bei .zip)").
  it("startet eine .xml direkt in der Phase parsing, nicht unzipping", async () => {
    const host = hostSpy();
    const states: ImportState[] = [];
    const ctrl = new ImportController(host, (s) => states.push(s));

    await ctrl.start(new File([XML], "Export.xml"));

    expect(states[0]).toMatchObject({ status: "running", phase: "parsing" });
  });

  it("schreibt keinen Cache, wenn abgebrochen wurde", async () => {
    const host = hostSpy();
    const ctrl = new ImportController(host, () => {});
    // Sofort abbrechen: start() prüft das Signal, bevor der Stream läuft.
    const running = ctrl.start(new File([XML], "Export.xml"));
    ctrl.abort();
    await running;

    expect(ctrl.state).toEqual({ status: "aborted" });
    expect(host.written).toHaveLength(0);
  });

  it("überschreibt aborted nicht mit failed, wenn der Stream-Teardown nach dem Abbruch noch einen echten Fehler wirft", async () => {
    const host = hostSpy();
    const ctrl = new ImportController(host, () => {});
    const { file, pulled, failNow } = fileWithStreamThatFailsOnDemand("Export.xml");

    const running = ctrl.start(file);
    await pulled; // reader.read() hängt jetzt tatsächlich
    ctrl.abort();
    failNow(new Error("Stream während Abbruch zerstört"));
    await running;

    expect(ctrl.state).toEqual({ status: "aborted" });
    expect(host.written).toHaveLength(0);
  });

  it("meldet einen Lesefehler als failed", async () => {
    const host = hostSpy();
    const ctrl = new ImportController(host, () => {});
    // .zip ohne gültigen Zip-Inhalt → fflate scheitert
    await ctrl.start(new File(["kein zip"], "kaputt.zip"));

    expect(ctrl.state.status).toBe("failed");
  });

  it("meldet einen Schreibfehler als failed", async () => {
    const host: ImportControllerHost = {
      writeCache: () => Promise.reject(new Error("Platte voll")),
    };
    const ctrl = new ImportController(host, () => {});
    await ctrl.start(new File([XML], "Export.xml"));

    expect(ctrl.state).toEqual({ status: "failed", message: "Platte voll" });
  });

  /*
   * Schreiben ist der Punkt ohne Umkehr: Der Cache ist zu diesem Zeitpunkt ein
   * vollständiges, korrektes Ergebnis, das gerade auf die Platte fließt. Ein abort(),
   * das währenddessen eintrifft, muss wirkungslos bleiben — sonst hätte man entweder
   * einen verwaisten Cache auf der Platte, während die UI "abgebrochen" meldet, oder
   * müsste eine gerade geschriebene Datei wieder löschen. Die beiden folgenden Tests
   * pinnen das jeweils an einer eigenen Stelle: einmal den Endzustand nach Abschluss
   * (Regression in `abort()` selbst), einmal den Zustand unmittelbar während des
   * Schreibens (Regression, die den Abbruch doch synchron durchschlagen ließe).
   */

  it("verwirft einen abort(), der während des Schreibens eintrifft — der Import schließt korrekt mit done ab", async () => {
    const host = hostSpy();
    // .bind(host): host.writeCache erfüllt die Interface-Methodensignatur (die `this`
    // nutzen dürfte), auch wenn die konkrete Testimplementierung eine `this`-freie Arrow
    // Function ist — @typescript-eslint/unbound-method kann das nicht unterscheiden.
    const realWrite = host.writeCache.bind(host);
    let ctrl!: ImportController;
    host.writeCache = (c) => {
      // Simuliert: Der Nutzer klickt "Abbrechen", während writeCache() bereits läuft.
      ctrl.abort();
      return realWrite(c);
    };
    const states: ImportState[] = [];
    ctrl = new ImportController(host, (s) => states.push(s));

    await ctrl.start(new File([XML], "Export.xml"));

    expect(ctrl.state).toEqual({ status: "done", records: 1 });
    expect(host.written).toHaveLength(1);
    expect(states.some((s) => s.status === "aborted")).toBe(false);
  });

  it("abort() während des Schreibens kippt den Zustand nicht von running/writing weg", async () => {
    const host = hostSpy();
    let stateDuringWrite: ImportState | undefined;
    let ctrl!: ImportController;
    host.writeCache = (c) => {
      ctrl.abort();
      stateDuringWrite = ctrl.state;
      return Promise.resolve().then(() => { host.written.push(c); });
    };
    ctrl = new ImportController(host, () => {});

    await ctrl.start(new File([XML], "Export.xml"));

    expect(stateDuringWrite?.status).toBe("running");
    expect(stateDuringWrite).toMatchObject({ status: "running", phase: "writing" });
  });
});
