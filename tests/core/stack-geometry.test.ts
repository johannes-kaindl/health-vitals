import { buildStackGeometry } from "../../src/core/chart-geometry";
import type { StagePoint } from "../../src/core/sleep-stages";

const DIMS = { width: 100, height: 100, padding: 10 };

function point(key: string, s: Partial<Record<"deep" | "core" | "rem" | "unspecified", number>>): StagePoint {
  return {
    key,
    stages: { deep: 0, core: 0, rem: 0, unspecified: 0, ...s },
    nights: 1,
    awakeAvg: 0,
  };
}

describe("buildStackGeometry", () => {
  it("stapelt die Segmente lückenlos und so hoch wie ihre Summe", () => {
    // 240 Minuten gesamt bei innerH = 80 → der Stapel füllt die volle Höhe.
    const geom = buildStackGeometry([point("2026-01-01", { deep: 60, core: 120, rem: 60 })], DIMS);

    const segs = geom.stacks[0].segments;
    expect(segs.map((s) => s.stage)).toEqual(["deep", "core", "rem"]);
    // Höhen im Verhältnis der Minuten: 1/4, 1/2, 1/4 von 80.
    expect(segs.map((s) => s.h)).toEqual([20, 40, 20]);
    // Lückenlos: jedes Segment beginnt, wo das vorige endet.
    expect(segs[1].y + segs[1].h).toBe(segs[0].y);
    expect(segs[2].y + segs[2].h).toBe(segs[1].y);
    // Der Stapel steht auf der Grundlinie und endet oben am Innenrand.
    expect(segs[0].y + segs[0].h).toBe(90);
    expect(segs[2].y).toBe(10);
  });

  it("lässt Phasen ohne Minuten ganz weg statt sie als 0-hohes Rect zu führen", () => {
    const geom = buildStackGeometry([point("2026-01-01", { unspecified: 300 })], DIMS);

    expect(geom.stacks[0].segments.map((s) => s.stage)).toEqual(["unspecified"]);
  });

  it("skaliert alle Stapel auf dieselbe Achse, nicht jeden für sich", () => {
    const geom = buildStackGeometry([
      point("2026-01-01", { core: 400 }),
      point("2026-01-02", { core: 200 }),
    ], DIMS);

    // Die halbe Nacht ist halb so hoch — sonst wäre die Grafik unlesbar.
    expect(geom.stacks[1].segments[0].h).toBe(geom.stacks[0].segments[0].h / 2);
  });

  it("gibt bei leerer Eingabe eine leere, aber gültige Geometrie zurück", () => {
    const geom = buildStackGeometry([], DIMS);

    expect(geom.stacks).toEqual([]);
    expect(geom.width).toBe(100);
    expect(geom.yTicks).toEqual([]);
  });
});

describe("buildStackGeometry — Achsen", () => {
  const week = ["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08"]; // 05.01.2026 ist ein Montag
  const points = week.map((k) => point(k, { core: 400 }));

  it("liefert ohne Granularität keine Achsendaten", () => {
    // Gleiche Regel wie beim Linien-/Balken-Chart: Achsen entstehen nur auf Anfrage.
    const geom = buildStackGeometry(points, DIMS);

    expect(geom.xTicks).toEqual([]);
    expect(geom.weekMarks).toEqual([]);
  });

  it("setzt x-Ticks in die Slot-Mitte, wie beim Balken-Chart", () => {
    const geom = buildStackGeometry(points, DIMS, { granularity: "day" });

    // innerW 80 / 4 Slots = 20 breit, Mitte des ersten Slots = 10 + 10 = 20.
    expect(geom.xTicks[0]).toEqual({ i: 0, x: 20 });
  });

  it("markiert Wochenanfänge am Slot-Rand, nur bei Tages-Granularität", () => {
    const geom = buildStackGeometry(points, DIMS, { granularity: "day" });

    expect(geom.weekMarks).toEqual([10]); // Montag ist der erste Slot, Rand bei padding

    const monthly = buildStackGeometry(points, DIMS, { granularity: "month" });
    expect(monthly.weekMarks).toEqual([]);
  });
});
