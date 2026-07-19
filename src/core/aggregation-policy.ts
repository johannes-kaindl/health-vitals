export type Policy = "sum" | "measure" | "duration";

// Kumulative Mengen → Tages-Summe. Alles andere Quantity → measure (min/max/avg).
const SUM_TYPES = new Set<string>([
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierDistanceWalkingRunning",
  "HKQuantityTypeIdentifierDistanceCycling",
  "HKQuantityTypeIdentifierDistanceSwimming",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKQuantityTypeIdentifierBasalEnergyBurned",
  "HKQuantityTypeIdentifierFlightsClimbed",
  "HKQuantityTypeIdentifierAppleExerciseTime",
  "HKQuantityTypeIdentifierAppleStandTime",
  "HKQuantityTypeIdentifierSwimmingStrokeCount",
  "HKQuantityTypeIdentifierTimeInDaylight",
  "HKQuantityTypeIdentifierDietaryWater",
]);

export function policyFor(type: string): Policy {
  if (SUM_TYPES.has(type)) return "sum";
  if (type.startsWith("HKCategoryTypeIdentifier")) return "duration";
  return "measure";
}
