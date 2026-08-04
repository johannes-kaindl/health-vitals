import {
  classifySleepValue,
  nightDayFor,
  unionMinutes,
  SleepCollector,
  NIGHT_CUTOFF_HOUR,
  type SleepRecordInput,
} from "../../src/core/sleep-session";

const V = "HKCategoryValueSleepAnalysis";

function rec(value: string, start: string, end: string): SleepRecordInput {
  return { categoryValue: value, startDate: start, endDate: end };
}

describe("classifySleepValue", () => {
  it("erkennt alle im echten Export vorkommenden Werte", () => {
    expect(classifySleepValue(V + "InBed")).toEqual({ kind: "inBed", stage: null });
    expect(classifySleepValue(V + "Awake")).toEqual({ kind: "awake", stage: null });
    expect(classifySleepValue(V + "AsleepCore")).toEqual({ kind: "asleep", stage: "core" });
    expect(classifySleepValue(V + "AsleepDeep")).toEqual({ kind: "asleep", stage: "deep" });
    expect(classifySleepValue(V + "AsleepREM")).toEqual({ kind: "asleep", stage: "rem" });
    expect(classifySleepValue(V + "AsleepUnspecified")).toEqual({ kind: "asleep", stage: "unspecified" });
  });

  it("zählt eine künftige, unbekannte Schlafphase als Schlaf statt sie zu verwerfen", () => {
    // Das Schema wächst mit jeder watchOS-Version. Ein neues "AsleepLight" darf nicht
    // stillschweigend aus der Nacht fallen — es zählt als Schlaf ohne bekannte Phase.
    expect(classifySleepValue(V + "AsleepLight")).toEqual({ kind: "asleep", stage: "unspecified" });
  });

  it("verwirft, was keine Schlafaussage trägt", () => {
    expect(classifySleepValue("")).toBeNull();
    expect(classifySleepValue("HKCategoryValueNotApplicable")).toBeNull();
  });
});

describe("nightDayFor", () => {
  it("ordnet Schlaf vor dem Cut-Off dem laufenden Tag zu (= Aufwachtag)", () => {
    expect(nightDayFor("2022-02-06 01:44:00 +0200")).toBe("2022-02-06");
    expect(nightDayFor("2022-02-06 07:05:00 +0200")).toBe("2022-02-06");
  });

  it("ordnet Schlaf ab dem Cut-Off dem Folgetag zu", () => {
    expect(nightDayFor("2022-02-06 23:37:00 +0200")).toBe("2022-02-07");
    expect(nightDayFor(`2022-02-06 ${String(NIGHT_CUTOFF_HOUR).padStart(2, "0")}:00:00 +0200`)).toBe("2022-02-07");
  });

  it("rechnet über Monats- und Jahresgrenzen", () => {
    expect(nightDayFor("2022-01-31 23:00:00 +0200")).toBe("2022-02-01");
    expect(nightDayFor("2021-12-31 22:15:00 +0100")).toBe("2022-01-01");
    expect(nightDayFor("2024-02-28 23:00:00 +0100")).toBe("2024-02-29"); // Schaltjahr
  });

  it("gibt unbrauchbare Datumsangaben unverändert zurück, statt zu raten", () => {
    expect(nightDayFor("kaputt")).toBe("kaputt");
  });
});

describe("unionMinutes", () => {
  const at = (h: number, m = 0): number => Date.UTC(2022, 1, 6, h, m);

  it("leere Menge → 0", () => {
    expect(unionMinutes([])).toBe(0);
  });

  it("disjunkte Intervalle werden addiert", () => {
    expect(unionMinutes([
      { startMs: at(1), endMs: at(2) },
      { startMs: at(4), endMs: at(5) },
    ])).toBe(120);
  });

  it("ein umschliessendes Intervall zaehlt die Zeit darin NICHT doppelt", () => {
    // Genau der Realfall: InBed 00:30–10:00 mit Phasen darin.
    expect(unionMinutes([
      { startMs: at(0, 30), endMs: at(10) },
      { startMs: at(1, 44), endMs: at(3, 18) },
      { startMs: at(3, 22), endMs: at(6, 44) },
    ])).toBe(570); // = 9,5 h, nicht 9,5 + 1,57 + 3,37
  });

  it("teilweise Ueberlappung wird zu einem Fenster verschmolzen", () => {
    expect(unionMinutes([
      { startMs: at(1), endMs: at(3) },
      { startMs: at(2), endMs: at(4) },
    ])).toBe(180);
  });

  it("nahtlos anschliessende Intervalle ergeben ein Fenster", () => {
    expect(unionMinutes([
      { startMs: at(1), endMs: at(2) },
      { startMs: at(2), endMs: at(3) },
    ])).toBe(120);
  });

  it("ist unabhaengig von der Eingabereihenfolge", () => {
    const a = { startMs: at(4), endMs: at(5) };
    const b = { startMs: at(1), endMs: at(2) };
    expect(unionMinutes([a, b])).toBe(unionMinutes([b, a]));
  });
});

describe("SleepCollector — die drei Defekte, gegen echte Exportmuster", () => {
  it("Defekt 1: Phasen innerhalb von InBed werden nicht dazuaddiert", () => {
    const c = new SleepCollector();
    c.add(rec(V + "InBed", "2022-02-06 00:30:00 +0200", "2022-02-06 10:00:00 +0200"));
    c.add(rec(V + "AsleepCore", "2022-02-06 01:44:00 +0200", "2022-02-06 03:18:00 +0200"));
    c.add(rec(V + "AsleepDeep", "2022-02-06 03:22:00 +0200", "2022-02-06 06:44:00 +0200"));
    const [n] = c.finalize();

    expect(n.inBedMin).toBe(570);        // 9,5 h Liegezeit (die Phasen liegen darin)
    expect(n.asleepMin).toBe(94 + 202);  // nur die Phasen selbst
    // Die alte Rechnung (alles addieren) käme auf 866 min = 14,4 h.
    expect(n.inBedMin + n.asleepMin).toBe(866);
    expect(n.asleepMin).toBeLessThan(n.inBedMin);
  });

  it("Liegezeit ist nie kuerzer als Schlafzeit, auch ohne InBed-Record", () => {
    // Realfall in 23,8 % der Nächte: Die Watch meldet Phasen, das iPhone schreibt
    // für dieselbe Nacht kein InBed. Eine Liegezeit unter der Schlafzeit wäre eine
    // ebenso unmögliche Aussage wie eine 33-Stunden-Nacht.
    const c = new SleepCollector();
    c.add(rec(V + "AsleepCore", "2022-02-06 01:00:00 +0200", "2022-02-06 06:00:00 +0200"));
    c.add(rec(V + "InBed", "2022-02-06 01:30:00 +0200", "2022-02-06 02:00:00 +0200"));
    const [n] = c.finalize();

    expect(n.asleepMin).toBe(300);
    expect(n.inBedMin).toBe(300);                       // nicht 30
    expect(n.inBedMin).toBeGreaterThanOrEqual(n.asleepMin);
  });

  it("Liegezeit umfasst Zeit vor dem Einschlafen und nach dem Aufwachen", () => {
    const c = new SleepCollector();
    c.add(rec(V + "InBed", "2022-02-06 22:30:00 +0200", "2022-02-07 07:30:00 +0200"));
    c.add(rec(V + "AsleepCore", "2022-02-06 23:00:00 +0200", "2022-02-07 07:00:00 +0200"));
    const [n] = c.finalize();

    expect(n.asleepMin).toBe(480); // 8 h
    expect(n.inBedMin).toBe(540);  // 9 h — die halbe Stunde vorn und hinten zählt mit
  });

  it("Defekt 2: zwei Quellen fuer dieselbe Nacht zaehlen die Zeit einmal", () => {
    // Realmuster vom 2021-05-16: iPhone meldet InBed, die Watch parallel Asleep.
    const c = new SleepCollector();
    c.add(rec(V + "AsleepUnspecified", "2021-05-16 00:31:00 +0200", "2021-05-16 01:40:00 +0200"));
    c.add(rec(V + "AsleepUnspecified", "2021-05-16 00:31:00 +0200", "2021-05-16 01:40:00 +0200"));
    const [n] = c.finalize();

    expect(n.asleepMin).toBe(69); // nicht 138
    expect(n.count).toBe(2);      // beide Records sind trotzdem gezählt
  });

  it("Defekt 3: zwei Naechte an einem Kalendertag landen in getrennten Naechten", () => {
    // Der Fall, der 33,6-h-Tage erzeugte: der Schlaf, der morgens endet, und der,
    // der abends beginnt, teilen sich das Startdatum — aber nicht die Nacht.
    const c = new SleepCollector();
    c.add(rec(V + "AsleepCore", "2022-02-06 01:44:00 +0200", "2022-02-06 06:44:00 +0200"));
    c.add(rec(V + "AsleepCore", "2022-02-06 23:37:00 +0200", "2022-02-07 05:59:00 +0200"));
    const nights = c.finalize();

    expect(nights.map((n) => n.day)).toEqual(["2022-02-06", "2022-02-07"]);
    expect(nights[0].asleepMin).toBe(300);
    expect(nights[1].asleepMin).toBe(382);
    for (const n of nights) expect(n.asleepMin).toBeLessThan(24 * 60);
  });

  it("die Gesamtnacht bleibt unter 24 h, auch wenn alle drei Defekte zusammentreffen", () => {
    // Nachbau des schlimmsten realen Tages (2019-11-16, laut Cache 33,6 h).
    const c = new SleepCollector();
    c.add(rec(V + "AsleepUnspecified", "2019-11-16 01:15:00 +0200", "2019-11-16 02:01:00 +0200"));
    c.add(rec(V + "InBed", "2019-11-16 01:15:00 +0200", "2019-11-16 11:13:00 +0200"));
    c.add(rec(V + "AsleepUnspecified", "2019-11-16 03:46:00 +0200", "2019-11-16 11:13:00 +0200"));
    c.add(rec(V + "InBed", "2019-11-16 18:30:00 +0200", "2019-11-16 19:23:00 +0200"));
    c.add(rec(V + "AsleepUnspecified", "2019-11-16 18:30:00 +0200", "2019-11-16 19:23:00 +0200"));
    c.add(rec(V + "AsleepUnspecified", "2019-11-16 23:45:00 +0200", "2019-11-17 04:36:00 +0200"));
    c.add(rec(V + "InBed", "2019-11-16 23:45:00 +0200", "2019-11-17 08:32:00 +0200"));

    const nights = c.finalize();
    for (const n of nights) {
      expect(n.asleepMin).toBeLessThanOrEqual(24 * 60);
      expect(n.inBedMin).toBeLessThanOrEqual(24 * 60);
    }
    // Der Tag selbst: Liegezeit 01:15–11:13 plus das Nickerchen 18:30–19:23.
    const day = nights.find((n) => n.day === "2019-11-16");
    expect(day?.inBedMin).toBe(598 + 53);
    // Drei disjunkte Asleep-Fenster (01:15–02:01, 03:46–11:13, 18:30–19:23) — hier
    // wird nichts verschmolzen, die Vereinigung darf also auch nichts abziehen.
    expect(day?.asleepMin).toBe(46 + 447 + 53);
    // Der Record ab 23:45 gehört wegen des Cut-Offs bereits zur Nacht auf den 17.
    expect(nights.find((n) => n.day === "2019-11-17")?.asleepMin).toBe(291);
  });

  it("Awake zaehlt nicht als Schlaf, wird aber ausgewiesen", () => {
    const c = new SleepCollector();
    c.add(rec(V + "AsleepCore", "2022-02-06 01:00:00 +0200", "2022-02-06 05:00:00 +0200"));
    c.add(rec(V + "Awake", "2022-02-06 03:00:00 +0200", "2022-02-06 03:20:00 +0200"));
    const [n] = c.finalize();

    expect(n.asleepMin).toBe(240); // Awake wird NICHT abgezogen: es liegt in InBed, nicht in Asleep
    expect(n.awakeMin).toBe(20);
  });

  it("weist die Phasen einzeln aus", () => {
    const c = new SleepCollector();
    c.add(rec(V + "AsleepCore", "2022-02-06 01:00:00 +0200", "2022-02-06 03:00:00 +0200"));
    c.add(rec(V + "AsleepDeep", "2022-02-06 03:00:00 +0200", "2022-02-06 04:00:00 +0200"));
    c.add(rec(V + "AsleepREM", "2022-02-06 04:00:00 +0200", "2022-02-06 04:30:00 +0200"));
    const [n] = c.finalize();

    expect(n.stages).toEqual({ core: 120, deep: 60, rem: 30, unspecified: 0 });
    expect(n.asleepMin).toBe(210);
  });

  it("ignoriert kaputte und rueckwaerts laufende Zeitstempel", () => {
    const c = new SleepCollector();
    c.add(rec(V + "AsleepCore", "2022-02-06 05:00:00 +0200", "2022-02-06 01:00:00 +0200")); // Ende vor Start
    c.add(rec(V + "AsleepCore", "kaputt", "2022-02-06 01:00:00 +0200"));
    c.add(rec(V + "AsleepCore", "2022-02-06 01:00:00 +0200", "2022-02-06 01:00:00 +0200")); // Nulldauer
    expect(c.finalize()).toEqual([]);
    expect(c.size).toBe(0);
  });

  it("liefert Naechte aufsteigend sortiert, unabhaengig von der Einfuegereihenfolge", () => {
    const c = new SleepCollector();
    c.add(rec(V + "AsleepCore", "2022-03-02 01:00:00 +0200", "2022-03-02 02:00:00 +0200"));
    c.add(rec(V + "AsleepCore", "2022-01-05 01:00:00 +0200", "2022-01-05 02:00:00 +0200"));
    c.add(rec(V + "AsleepCore", "2022-02-06 01:00:00 +0200", "2022-02-06 02:00:00 +0200"));
    expect(c.finalize().map((n) => n.day)).toEqual(["2022-01-05", "2022-02-06", "2022-03-02"]);
  });
});
