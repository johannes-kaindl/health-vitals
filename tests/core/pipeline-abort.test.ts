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

  it("ruft yieldToUi zeitgesteuert auf", async () => {
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

  it("läuft ohne Optionen unverändert durch", async () => {
    const xml = '<HealthData><Record type="HKQuantityTypeIdentifierStepCount" '
      + 'startDate="2026-07-01 08:00:00 +0200" value="100"/></HealthData>';
    const cache = await aggregateStream([xml], META);
    expect(cache.recordCount).toBe(1);
  });
});
