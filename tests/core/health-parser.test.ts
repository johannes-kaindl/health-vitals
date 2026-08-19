import { EventReader, eventFromTag, type RecordEvent, type WorkoutEvent } from "../../src/core/health-parser";
import type { StartTag, Token } from "../../src/core/xml-tokenizer";

function tag(name: string, attrs: Record<string, string>): StartTag {
  return { name, attrs, selfClosing: true };
}

function start(name: string, attrs: Record<string, string>, selfClosing = true): Token {
  return { kind: "start", name, attrs, selfClosing };
}
function end(name: string): Token {
  return { kind: "end", name };
}

describe("health-parser", () => {
  it("mappt Record inkl. numerischem value", () => {
    const e = eventFromTag(tag("Record", {
      type: "HKQuantityTypeIdentifierStepCount", unit: "count",
      startDate: "2022-11-25 08:39:02 +0200", endDate: "2022-11-25 08:47:00 +0200", value: "214",
    })) as RecordEvent;
    expect(e.kind).toBe("record");
    expect(e.value).toBe(214);
    expect(e.type).toBe("HKQuantityTypeIdentifierStepCount");
  });

  it("value=null bei fehlendem oder nicht-numerischem value", () => {
    const missing = eventFromTag(tag("Record", { type: "T", startDate: "2022-11-25 08:00:00 +0200" })) as RecordEvent;
    expect(missing.value).toBeNull();
    const cat = eventFromTag(tag("Record", {
      type: "HKCategoryTypeIdentifierSleepAnalysis", value: "HKCategoryValueSleepAnalysisAsleepCore",
      startDate: "2022-11-25 08:00:00 +0200",
    })) as RecordEvent;
    expect(cat.value).toBeNull();
  });

  it("value=null bei leerem value-String (nicht 0)", () => {
    const empty = eventFromTag(tag("Record", {
      type: "T", startDate: "2022-11-25 08:00:00 +0200", value: "",
    })) as RecordEvent;
    expect(empty.value).toBeNull();
  });

  it("skippt Record ohne type oder startDate", () => {
    expect(eventFromTag(tag("Record", { type: "T" }))).toBeNull();
    expect(eventFromTag(tag("Record", { startDate: "2022-11-25 08:00:00 +0200" }))).toBeNull();
  });

  it("ignoriert fremde Tags", () => {
    expect(eventFromTag(tag("MetadataEntry", { key: "k", value: "v" }))).toBeNull();
  });
});

describe("EventReader — Workout-Rahmen", () => {
  it("gibt das Workout erst beim End-Tag heraus", () => {
    const r = new EventReader();
    expect(r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      duration: "52", durationUnit: "min",
      startDate: "2026-07-28 07:00:00 +0200", endDate: "2026-07-28 07:52:00 +0200",
    }, false))).toBeNull();
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.kind).toBe("workout");
    expect(w.activityType).toBe("HKWorkoutActivityTypeRunning");
    expect(w.duration).toBe(52);
  });

  it("selbstschließendes Workout wird sofort fertig", () => {
    const r = new EventReader();
    const w = r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeYoga",
      duration: "35", durationUnit: "min", startDate: "2026-07-25 19:00:00 +0200",
    })) as WorkoutEvent;
    expect(w?.kind).toBe("workout");
    expect(w.duration).toBe(35);
  });

  it("rechnet durationUnit um, statt Minuten anzunehmen", () => {
    const r = new EventReader();
    const w = r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      duration: "1800", durationUnit: "s", startDate: "2026-07-28 07:00:00 +0200",
    })) as WorkoutEvent;
    expect(w.duration).toBe(30);
  });

  it("unbekannte durationUnit → Dauer 0 statt falscher Zahl", () => {
    const r = new EventReader();
    const w = r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      duration: "5", durationUnit: "fortnights", startDate: "2026-07-28 07:00:00 +0200",
    })) as WorkoutEvent;
    expect(w.duration).toBe(0);
  });

  it("Records laufen zustandslos durch, auch innerhalb eines offenen Rahmens", () => {
    const r = new EventReader();
    r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      duration: "52", durationUnit: "min", startDate: "2026-07-28 07:00:00 +0200",
    }, false));
    const rec = r.push(start("Record", {
      type: "HKQuantityTypeIdentifierStepCount", unit: "count",
      startDate: "2026-07-28 07:10:00 +0200", value: "214",
    })) as RecordEvent;
    expect(rec.kind).toBe("record");
    expect(rec.value).toBe(214);
  });

  // Robustheit statt Strenge: der Parser soll Schema-Änderungen überleben, nicht
  // an ihnen sterben (AGENTS.md, "Gotchas").
  it("End-Tag ohne offenen Rahmen wird verworfen, nicht geworfen", () => {
    const r = new EventReader();
    expect(() => r.push(end("Workout"))).not.toThrow();
    expect(r.push(end("Workout"))).toBeNull();
  });

  it("fremde Kindelemente schließen den Rahmen nicht", () => {
    const r = new EventReader();
    r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeCycling",
      duration: "74", durationUnit: "min", startDate: "2026-07-26 16:00:00 +0200",
    }, false));
    expect(r.push(start("MetadataEntry", { key: "k", value: "v" }))).toBeNull();
    expect(r.push(start("WorkoutEvent", { type: "HKWorkoutEventTypePause" }))).toBeNull();
    expect(r.push(end("MetadataEntry"))).toBeNull();
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.kind).toBe("workout");
    expect(w.duration).toBe(74);
  });

  it("Workout ohne activityType oder startDate ergibt kein Ereignis", () => {
    const r = new EventReader();
    r.push(start("Workout", { duration: "10", durationUnit: "min" }, false));
    expect(r.push(end("Workout"))).toBeNull();
  });

  it("abgebrochener Datenstrom: ein nie geschlossenes Workout faellt weg", () => {
    const r = new EventReader();
    expect(r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      duration: "52", durationUnit: "min", startDate: "2026-07-28 07:00:00 +0200",
    }, false))).toBeNull();
    // Ein zweites Workout eroeffnet einen neuen Rahmen. Das erste ist damit endgueltig
    // verloren — sein Ereignis darf nirgends nachtraeglich auftauchen.
    expect(r.push(start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeYoga",
      duration: "35", durationUnit: "min", startDate: "2026-07-29 19:00:00 +0200",
    }, false))).toBeNull();
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.activityType).toBe("HKWorkoutActivityTypeYoga");
    expect(r.push(end("Workout"))).toBeNull();
  });
});

describe("EventReader — WorkoutStatistics", () => {
  function stat(attrs: Record<string, string>): Token {
    return { kind: "start", name: "WorkoutStatistics", attrs, selfClosing: true };
  }
  function lauf(): Token {
    return start("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeRunning",
      duration: "52", durationUnit: "min", startDate: "2026-07-28 07:00:00 +0200",
    }, false);
  }

  it("liest Distanz und aktive Energie", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierDistanceWalkingRunning", sum: "9.1", unit: "km" }));
    r.push(stat({ type: "HKQuantityTypeIdentifierActiveEnergyBurned", sum: "612", unit: "kcal" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.distanceKm).toBeCloseTo(9.1, 6);
    expect(w.energyKcal).toBeCloseTo(612, 6);
  });

  it("rechnet Meilen um", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierDistanceWalkingRunning", sum: "3", unit: "mi" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.distanceKm).toBeCloseTo(4.828032, 6);
  });

  // Der Grundumsatz faellt auch im Schlaf an. Ihn mitzuzaehlen macht aus 612 kcal
  // Laufen ~890 kcal und beantwortet keine Trainingsfrage.
  it("ignoriert BasalEnergyBurned", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierActiveEnergyBurned", sum: "612", unit: "kcal" }));
    r.push(stat({ type: "HKQuantityTypeIdentifierBasalEnergyBurned", sum: "278", unit: "kcal" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.energyKcal).toBeCloseTo(612, 6);
  });

  it("addiert mehrere Distanz-Typen zur Gesamtstrecke", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierDistanceCycling", sum: "20", unit: "km" }));
    r.push(stat({ type: "HKQuantityTypeIdentifierDistanceWalkingRunning", sum: "5", unit: "km" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.distanceKm).toBeCloseTo(25, 6);
  });

  it("ignoriert Statistics ohne sum (HeartRate traegt nur average/min/max)", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierHeartRate", average: "148", minimum: "96", maximum: "171", unit: "count/min" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.distanceKm).toBeUndefined();
    expect(w.energyKcal).toBeUndefined();
  });

  it("unbekannte Einheit → Feld bleibt leer statt falscher Zahl", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierDistanceWalkingRunning", sum: "9.1", unit: "furlong" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.distanceKm).toBeUndefined();
  });

  it("Workout ohne Statistics traegt keine leeren Felder", () => {
    const r = new EventReader();
    r.push(lauf());
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect("distanceKm" in w).toBe(false);
    expect("energyKcal" in w).toBe(false);
  });

  it("Statistics ausserhalb eines Rahmens wird ignoriert", () => {
    const r = new EventReader();
    expect(r.push(stat({ type: "HKQuantityTypeIdentifierDistanceWalkingRunning", sum: "9.1", unit: "km" }))).toBeNull();
  });

  // `Number("")` ist 0, nicht NaN — ohne eigenen Guard wuerde daraus ein gemessenes
  // „0 km", das der Export nie behauptet hat.
  it("leerer sum-String zaehlt nicht als gemessene Null", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierDistanceWalkingRunning", sum: "", unit: "km" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect("distanceKm" in w).toBe(false);
  });

  it("addiert mehrere ActiveEnergyBurned-Elemente", () => {
    const r = new EventReader();
    r.push(lauf());
    r.push(stat({ type: "HKQuantityTypeIdentifierActiveEnergyBurned", sum: "300", unit: "kcal" }));
    r.push(stat({ type: "HKQuantityTypeIdentifierActiveEnergyBurned", sum: "312", unit: "kcal" }));
    const w = r.push(end("Workout")) as WorkoutEvent;
    expect(w.energyKcal).toBeCloseTo(612, 6);
  });
});
