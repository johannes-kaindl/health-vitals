import type { Policy } from "./aggregation-policy";
import { t } from "../vendor/kit/i18n";

export type Category = "activity" | "heart" | "body" | "sleep" | "nutrition" | "other";
export type ChartKind = "line" | "bar";
export interface MetricInfo { name: string; category: Category; chartKind: ChartKind; }

interface CatalogEntry { category: Category; chartKind?: ChartKind; }

// Kuratierter Katalog der häufigen Identifier: nur Struktur (Kategorie/ChartKind).
// Die Anzeigenamen liegen sprachabhängig in src/i18n/strings.ts unter "metric.<id>".
const CATALOG: Record<string, CatalogEntry> = {
  HKQuantityTypeIdentifierStepCount: { category: "activity" },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { category: "activity" },
  HKQuantityTypeIdentifierDistanceCycling: { category: "activity" },
  HKQuantityTypeIdentifierFlightsClimbed: { category: "activity" },
  HKQuantityTypeIdentifierActiveEnergyBurned: { category: "activity" },
  HKQuantityTypeIdentifierBasalEnergyBurned: { category: "activity" },
  HKQuantityTypeIdentifierAppleExerciseTime: { category: "activity" },
  HKQuantityTypeIdentifierAppleStandTime: { category: "activity" },
  HKQuantityTypeIdentifierHeartRate: { category: "heart" },
  HKQuantityTypeIdentifierRestingHeartRate: { category: "heart" },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: { category: "heart" },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { category: "heart" },
  HKQuantityTypeIdentifierOxygenSaturation: { category: "heart" },
  HKQuantityTypeIdentifierBodyMass: { category: "body" },
  HKQuantityTypeIdentifierBodyMassIndex: { category: "body" },
  HKQuantityTypeIdentifierBodyFatPercentage: { category: "body" },
  HKQuantityTypeIdentifierHeight: { category: "body" },
  HKQuantityTypeIdentifierBodyTemperature: { category: "body" },
  // Kein Eintrag für HKCategoryTypeIdentifierSleepAnalysis mehr: Schlaf erscheint
  // seit Cache-Version 2 nicht mehr unter dem Apple-Identifier, sondern als die
  // beiden abgeleiteten Serien darunter (siehe core/sleep-session.ts).
  SleepAsleep: { category: "sleep" },
  SleepInBed: { category: "sleep" },
  HKCategoryTypeIdentifierMindfulSession: { category: "sleep" },
  HKQuantityTypeIdentifierDietaryWater: { category: "nutrition" },
  HKQuantityTypeIdentifierDietaryEnergyConsumed: { category: "nutrition" },
  HKQuantityTypeIdentifierDietaryProtein: { category: "nutrition" },
  HKQuantityTypeIdentifierDietaryCarbohydrates: { category: "nutrition" },
  HKQuantityTypeIdentifierDietaryFatTotal: { category: "nutrition" },
};

function chartFromPolicy(policy: Policy): ChartKind {
  return policy === "measure" ? "line" : "bar";
}

function fallbackName(id: string): string {
  const stripped = id
    .replace(/^HKQuantityTypeIdentifier/, "")
    .replace(/^HKCategoryTypeIdentifier/, "")
    .replace(/^HKDataTypeIdentifier/, "");
  // CamelCase → Wörter: "DietaryZinc" → "Dietary Zinc"
  return stripped.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || id;
}

export function describeMetric(id: string, policy: Policy): MetricInfo {
  const entry = CATALOG[id];
  if (entry) {
    return { name: t("metric." + id), category: entry.category, chartKind: entry.chartKind ?? chartFromPolicy(policy) };
  }
  return { name: fallbackName(id), category: "other", chartKind: chartFromPolicy(policy) };
}
