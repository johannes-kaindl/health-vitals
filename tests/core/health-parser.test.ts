import { eventFromTag, type RecordEvent, type WorkoutEvent } from "../../src/core/health-parser";
import type { StartTag } from "../../src/core/xml-tokenizer";

function tag(name: string, attrs: Record<string, string>): StartTag {
  return { name, attrs, selfClosing: true };
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

  it("skippt Record ohne type oder startDate", () => {
    expect(eventFromTag(tag("Record", { type: "T" }))).toBeNull();
    expect(eventFromTag(tag("Record", { startDate: "2022-11-25 08:00:00 +0200" }))).toBeNull();
  });

  it("mappt Workout", () => {
    const w = eventFromTag(tag("Workout", {
      workoutActivityType: "HKWorkoutActivityTypeTraditionalStrengthTraining",
      duration: "30.5", startDate: "2022-11-25 18:00:00 +0200", endDate: "2022-11-25 18:30:30 +0200",
    })) as WorkoutEvent;
    expect(w.kind).toBe("workout");
    expect(w.duration).toBe(30.5);
  });

  it("ignoriert fremde Tags", () => {
    expect(eventFromTag(tag("MetadataEntry", { key: "k", value: "v" }))).toBeNull();
  });
});
