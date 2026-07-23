// Bekannte Apple-Health-Workout-Typen (HKWorkoutActivityType*). Die Anzeigenamen liegen
// sprachabhängig in src/i18n/strings.ts unter "workout.<id>"; unbekannte → Fallback
// (Prefix strippen, CamelCase splitten).
import { t } from "../vendor/kit/i18n";

const KNOWN = new Set<string>([
  "HKWorkoutActivityTypeCardioDance",
  "HKWorkoutActivityTypeCoreTraining",
  "HKWorkoutActivityTypeCrossTraining",
  "HKWorkoutActivityTypeCycling",
  "HKWorkoutActivityTypeElliptical",
  "HKWorkoutActivityTypeFitnessGaming",
  "HKWorkoutActivityTypeFunctionalStrengthTraining",
  "HKWorkoutActivityTypeHiking",
  "HKWorkoutActivityTypeMindAndBody",
  "HKWorkoutActivityTypeOther",
  "HKWorkoutActivityTypePreparationAndRecovery",
  "HKWorkoutActivityTypeRunning",
  "HKWorkoutActivityTypeSwimming",
  "HKWorkoutActivityTypeTableTennis",
  "HKWorkoutActivityTypeTraditionalStrengthTraining",
  "HKWorkoutActivityTypeUnderwaterDiving",
  "HKWorkoutActivityTypeWalking",
  "HKWorkoutActivityTypeYoga",
]);

export function workoutTypeName(type: string): string {
  if (KNOWN.has(type)) return t("workout." + type);
  const stripped = type.replace(/^HKWorkoutActivityType/, "");
  return stripped.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || type;
}
