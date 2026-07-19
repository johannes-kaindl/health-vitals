import { workoutTypeName } from "../../src/core/workout-catalog";

describe("workoutTypeName", () => {
  it("kennt kuratierte Workout-Typen mit deutschem Namen", () => {
    expect(workoutTypeName("HKWorkoutActivityTypeCycling")).toBe("Radfahren");
    expect(workoutTypeName("HKWorkoutActivityTypeTraditionalStrengthTraining")).toBe("Krafttraining");
    expect(workoutTypeName("HKWorkoutActivityTypeRunning")).toBe("Laufen");
  });

  it("Fallback für Unbekannte: Prefix strippen, CamelCase splitten", () => {
    expect(workoutTypeName("HKWorkoutActivityTypeKickboxing")).toBe("Kickboxing");
    expect(workoutTypeName("HKWorkoutActivityTypeHighIntensityIntervalTraining")).toBe("High Intensity Interval Training");
  });
});
