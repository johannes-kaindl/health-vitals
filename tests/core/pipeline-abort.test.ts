import { aggregateStream, ImportAbortedError } from "../../src/core/pipeline";

const META = { sourceFile: "x.xml", importedAt: "2026-07-20T00:00:00.000Z" };

// Liefert endlos Chunks, damit der Abbruch die einzige Abbruchbedingung ist.
async function* endless(): AsyncIterable<string> {
  const record = '<Record type="HKQuantityTypeIdentifierStepCount" '
    + 'startDate="2026-07-01 08:00:00 +0200" value="100"/>';
  for (;;) {
    yield record;
    await Promise.resolve();
  }
}

describe("aggregateStream — Abbruch", () => {
  it("wirft ImportAbortedError, wenn das Signal vor dem Start gesetzt ist", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(aggregateStream(endless(), META, { signal: ctrl.signal }))
      .rejects.toBeInstanceOf(ImportAbortedError);
  });

  it("wirft ImportAbortedError, wenn mitten im Stream abgebrochen wird", async () => {
    const ctrl = new AbortController();
    let chunks = 0;
    async function* counted(): AsyncIterable<string> {
      for await (const c of endless()) {
        if (++chunks === 50) ctrl.abort();
        yield c;
      }
    }
    await expect(aggregateStream(counted(), META, { signal: ctrl.signal }))
      .rejects.toBeInstanceOf(ImportAbortedError);
    expect(chunks).toBeLessThan(200); // bricht zeitnah ab, läuft nicht weiter
  });

  // yieldEveryMs: 0 macht die Zeitschranke effektiv wirkungslos (jede Runde
  // erfüllt "Date.now() - lastYield >= 0"). Das prüft nur, dass yieldToUi
  // überhaupt verdrahtet ist und aufgerufen wird — nicht, dass die Drossel
  // tatsächlich Aufrufe unterdrückt. Siehe den Test darunter für Letzteres.
  it("ruft yieldToUi mindestens einmal auf (reine Verdrahtungsprüfung, keine Drosselprüfung)", async () => {
    let yields = 0;
    const ctrl = new AbortController();
    let chunks = 0;
    async function* counted(): AsyncIterable<string> {
      for await (const c of endless()) {
        if (++chunks === 100) ctrl.abort();
        yield c;
      }
    }
    await expect(aggregateStream(counted(), META, {
      signal: ctrl.signal,
      yieldToUi: () => { yields++; return Promise.resolve(); },
      yieldEveryMs: 0, // jede Runde yielden, damit der Test nicht auf Zeit warten muss
    })).rejects.toBeInstanceOf(ImportAbortedError);
    expect(yields).toBeGreaterThan(0);
  });

  it("unterdrückt yieldToUi-Aufrufe zwischen den Zeitschranken (deterministische Uhr)", async () => {
    const record = '<Record type="HKQuantityTypeIdentifierStepCount" '
      + 'startDate="2026-07-01 08:00:00 +0200" value="100"/>';
    const CHUNK_COUNT = 100;
    const STEP_MS = 10;
    const YIELD_EVERY_MS = 100;

    // Virtuelle Uhr: rückt pro angefordertem Chunk um STEP_MS vor, unabhängig
    // von der echten Wanduhr — macht den Test deterministisch statt zeitbasiert.
    let now = 0;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);

    async function* chunks(): AsyncIterable<string> {
      for (let i = 0; i < CHUNK_COUNT; i++) {
        now += STEP_MS;
        yield record;
      }
    }

    let yields = 0;
    try {
      const cache = await aggregateStream(chunks(), META, {
        yieldToUi: () => { yields++; return Promise.resolve(); },
        yieldEveryMs: YIELD_EVERY_MS,
      });
      expect(cache.recordCount).toBe(CHUNK_COUNT);
    } finally {
      nowSpy.mockRestore();
    }

    // Bei 10ms Schritt/Chunk und 100ms Schwelle darf frühestens alle 10 Chunks
    // ein yieldToUi erfolgen — exakt 10 von 100 Chunks. Ohne funktionierende
    // Zeitschranke (z.B. bei jedem Chunk oder gar keinem) schlägt das fehl.
    expect(yields).toBe(10);
    expect(yields).toBeLessThan(CHUNK_COUNT);
  });

  it("läuft ohne Optionen unverändert durch", async () => {
    const xml = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
      + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';
    const cache = await aggregateStream([xml], META);
    expect(cache.recordCount).toBe(1);
  });
});
