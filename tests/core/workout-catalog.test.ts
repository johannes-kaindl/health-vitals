import { workoutTypeName } from "../../src/core/workout-catalog";
import { setLang } from "../../src/vendor/kit/i18n";

describe("workoutTypeName", () => {
  it("kennt kuratierte Workout-Typen je Sprache", () => {
    setLang("de");
    expect(workoutTypeName("HKWorkoutActivityTypeCycling")).toBe("Radfahren");
    expect(workoutTypeName("HKWorkoutActivityTypeTraditionalStrengthTraining")).toBe("Krafttraining");
    setLang("en");
    expect(workoutTypeName("HKWorkoutActivityTypeCycling")).toBe("Cycling");
    expect(workoutTypeName("HKWorkoutActivityTypeTraditionalStrengthTraining")).toBe("Strength Training");
    expect(workoutTypeName("HKWorkoutActivityTypeRunning")).toBe("Running");
  });

  it("Fallback für Unbekannte: Prefix strippen, CamelCase splitten (sprachneutral)", () => {
    setLang("en");
    expect(workoutTypeName("HKWorkoutActivityTypeKickboxing")).toBe("Kickboxing");
    expect(workoutTypeName("HKWorkoutActivityTypeHighIntensityIntervalTraining")).toBe("High Intensity Interval Training");
  });
});
