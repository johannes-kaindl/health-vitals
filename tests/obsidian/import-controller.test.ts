import { ImportController, type ImportControllerHost } from "../../src/obsidian/import-controller";
import type { ImportState } from "../../src/core/import-state";
import type { HealthCache } from "../../src/core/types";

const XML = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
  + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';

function hostSpy(): ImportControllerHost & { written: HealthCache[] } {
  const written: HealthCache[] = [];
  return { written, writeCache: (c) => { written.push(c); return Promise.resolve(); } };
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
});
