import type { Policy } from "./aggregation-policy";

export type Category = "Aktivität" | "Herz" | "Körper" | "Schlaf" | "Ernährung" | "Sonstige";
export type ChartKind = "line" | "bar";
export interface MetricInfo { name: string; category: Category; chartKind: ChartKind; }

interface CatalogEntry { name: string; category: Category; chartKind?: ChartKind; }

// Kuratierter deutscher Katalog der häufigen Identifier. Unbekannte → Fallback (s.u.).
const CATALOG: Record<string, CatalogEntry> = {
  HKQuantityTypeIdentifierStepCount: { name: "Schritte", category: "Aktivität" },
  HKQuantityTypeIdentifierDistanceWalkingRunning: { name: "Gehstrecke", category: "Aktivität" },
  HKQuantityTypeIdentifierDistanceCycling: { name: "Radstrecke", category: "Aktivität" },
  HKQuantityTypeIdentifierFlightsClimbed: { name: "Etagen", category: "Aktivität" },
  HKQuantityTypeIdentifierActiveEnergyBurned: { name: "Aktive Energie", category: "Aktivität" },
  HKQuantityTypeIdentifierBasalEnergyBurned: { name: "Ruheenergie", category: "Aktivität" },
  HKQuantityTypeIdentifierAppleExerciseTime: { name: "Bewegungsminuten", category: "Aktivität" },
  HKQuantityTypeIdentifierAppleStandTime: { name: "Stehminuten", category: "Aktivität" },
  HKQuantityTypeIdentifierHeartRate: { name: "Puls", category: "Herz" },
  HKQuantityTypeIdentifierRestingHeartRate: { name: "Ruhepuls", category: "Herz" },
  HKQuantityTypeIdentifierWalkingHeartRateAverage: { name: "Geh-Puls Ø", category: "Herz" },
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: { name: "HRV", category: "Herz" },
  HKQuantityTypeIdentifierOxygenSaturation: { name: "Sauerstoffsättigung", category: "Herz" },
  HKQuantityTypeIdentifierBodyMass: { name: "Gewicht", category: "Körper" },
  HKQuantityTypeIdentifierBodyMassIndex: { name: "BMI", category: "Körper" },
  HKQuantityTypeIdentifierBodyFatPercentage: { name: "Körperfett", category: "Körper" },
  HKQuantityTypeIdentifierHeight: { name: "Größe", category: "Körper" },
  HKQuantityTypeIdentifierBodyTemperature: { name: "Körpertemperatur", category: "Körper" },
  HKCategoryTypeIdentifierSleepAnalysis: { name: "Schlaf", category: "Schlaf" },
  HKCategoryTypeIdentifierMindfulSession: { name: "Achtsamkeit", category: "Schlaf" },
  HKQuantityTypeIdentifierDietaryWater: { name: "Wasser", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryEnergyConsumed: { name: "Kalorien", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryProtein: { name: "Protein", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryCarbohydrates: { name: "Kohlenhydrate", category: "Ernährung" },
  HKQuantityTypeIdentifierDietaryFatTotal: { name: "Fett", category: "Ernährung" },
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
    return { name: entry.name, category: entry.category, chartKind: entry.chartKind ?? chartFromPolicy(policy) };
  }
  return { name: fallbackName(id), category: "Sonstige", chartKind: chartFromPolicy(policy) };
}
