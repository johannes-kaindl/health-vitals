// Kuratierter deutscher Katalog der Apple-Health-Workout-Typen (HKWorkoutActivityType*).
// Unbekannte → Fallback (Prefix strippen, CamelCase splitten).

const CATALOG: Record<string, string> = {
  HKWorkoutActivityTypeCardioDance: "Cardio-Dance",
  HKWorkoutActivityTypeCoreTraining: "Core-Training",
  HKWorkoutActivityTypeCrossTraining: "Cross-Training",
  HKWorkoutActivityTypeCycling: "Radfahren",
  HKWorkoutActivityTypeElliptical: "Crosstrainer",
  HKWorkoutActivityTypeFitnessGaming: "Fitness-Gaming",
  HKWorkoutActivityTypeFunctionalStrengthTraining: "Funktionelles Krafttraining",
  HKWorkoutActivityTypeHiking: "Wandern",
  HKWorkoutActivityTypeMindAndBody: "Körper & Geist",
  HKWorkoutActivityTypeOther: "Sonstiges",
  HKWorkoutActivityTypePreparationAndRecovery: "Aufwärmen & Erholung",
  HKWorkoutActivityTypeRunning: "Laufen",
  HKWorkoutActivityTypeSwimming: "Schwimmen",
  HKWorkoutActivityTypeTableTennis: "Tischtennis",
  HKWorkoutActivityTypeTraditionalStrengthTraining: "Krafttraining",
  HKWorkoutActivityTypeUnderwaterDiving: "Tauchen",
  HKWorkoutActivityTypeWalking: "Gehen",
  HKWorkoutActivityTypeYoga: "Yoga",
};

export function workoutTypeName(type: string): string {
  const entry = CATALOG[type];
  if (entry) return entry;
  const stripped = type.replace(/^HKWorkoutActivityType/, "");
  return stripped.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || type;
}
