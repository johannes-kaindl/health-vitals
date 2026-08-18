import { rollupSleepStages } from "../../src/core/sleep-stages";
import type { SleepStageDay } from "../../src/core/types";

function night(p: Partial<SleepStageDay>): SleepStageDay {
  return { core: 0, deep: 0, rem: 0, unspecified: 0, awake: 0, ...p };
}

describe("rollupSleepStages", () => {
  it("mittelt die Phasenminuten über die Nächte eines Buckets", () => {
    const stages: Record<string, SleepStageDay> = {
      "2026-01-05": night({ core: 200, deep: 60, rem: 40 }),
      "2026-01-06": night({ core: 100, deep: 20, rem: 20 }),
    };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };

    const out = rollupSleepStages(stages, r);

    expect(out.points).toEqual([
      { key: "2026-01", stages: { core: 150, deep: 40, rem: 30, unspecified: 0 }, nights: 2, awakeAvg: 0 },
    ]);
  });
});

describe("rollupSleepStages — Nächte ohne Schlaf", () => {
  it("zählt Nächte ohne jede Schlafminute nicht in den Nenner", () => {
    // Im echten Export haben 544 von 2044 Nächten nur Liege- oder Wachzeit erfasst.
    // Zählte man sie mit, sänke jeder Monatsschnitt, ohne dass jemand kürzer schlief.
    const stages: Record<string, SleepStageDay> = {
      "2026-01-05": night({ core: 300 }),
      "2026-01-06": night({ awake: 25 }), // im Bett, aber kein Schlaf erfasst
    };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };

    const out = rollupSleepStages(stages, r);

    expect(out.points[0].stages.core).toBe(300);
    expect(out.points[0].nights).toBe(1);
  });

  it("lässt einen Bucket ganz weg, wenn keine seiner Nächte Schlaf trägt", () => {
    const stages: Record<string, SleepStageDay> = { "2026-01-06": night({ awake: 25 }) };
    const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };

    expect(rollupSleepStages(stages, r).points).toEqual([]);
  });
});

describe("rollupSleepStages — Anteil unbestimmter Nächte", () => {
  const r = { from: "2026-01-01", to: "2026-01-31", granularity: "month" as const };

  it("meldet den Anteil der Nächte, die NUR unbestimmten Schlaf tragen", () => {
    // Vor watchOS 9 liefert der Export ausschließlich `AsleepUnspecified`; im echten
    // Bestand betrifft das 1022 von 1500 Nächten mit Schlaf. Der Anteil trägt den
    // Hinweis unter dem Chart — ohne ihn liest sich der graue Block wie ein Defekt.
    const stages: Record<string, SleepStageDay> = {
      "2026-01-05": night({ unspecified: 400 }),
      "2026-01-06": night({ unspecified: 380 }),
      "2026-01-07": night({ unspecified: 390 }),
      "2026-01-08": night({ core: 300, deep: 60 }),
    };

    expect(rollupSleepStages(stages, r).unspecifiedShare).toBe(0.75);
  });

  it("zählt eine Nacht mit Phasen NEBEN unbestimmter Zeit nicht als unbestimmt", () => {
    // Am Gerätewechsel kommt beides in derselben Nacht vor. Solange eine echte Phase
    // dabei ist, ist die Nacht aufgeschlüsselt — der Hinweis gilt ihr nicht.
    const stages: Record<string, SleepStageDay> = {
      "2026-01-05": night({ unspecified: 120, rem: 60 }),
    };

    expect(rollupSleepStages(stages, r).unspecifiedShare).toBe(0);
  });

  it("meldet 0, wenn der Zeitraum gar keine Nacht mit Schlaf enthält", () => {
    expect(rollupSleepStages({}, r).unspecifiedShare).toBe(0);
  });
});
