import { describeMetric } from "../../src/core/metric-catalog";
import { setLang } from "../../src/vendor/kit/i18n";

describe("metric-catalog", () => {
  it("kennt kuratierte Identifier: neutrale Kategorie-Keys, Name je Sprache", () => {
    setLang("de");
    expect(describeMetric("HKQuantityTypeIdentifierStepCount", "sum"))
      .toEqual({ name: "Schritte", category: "activity", chartKind: "bar" });
    expect(describeMetric("HKQuantityTypeIdentifierBodyMass", "measure"))
      .toEqual({ name: "Gewicht", category: "body", chartKind: "line" });
    setLang("en");
    expect(describeMetric("HKQuantityTypeIdentifierStepCount", "sum"))
      .toEqual({ name: "Steps", category: "activity", chartKind: "bar" });
    expect(describeMetric("HKQuantityTypeIdentifierBodyMass", "measure"))
      .toEqual({ name: "Weight", category: "body", chartKind: "line" });
  });

  it("leitet chartKind aus der Policy ab, wenn der Katalog keinen Override hat", () => {
    expect(describeMetric("HKQuantityTypeIdentifierHeartRate", "measure").chartKind).toBe("line");
    expect(describeMetric("HKCategoryTypeIdentifierMindfulSession", "duration").chartKind).toBe("bar");
  });

  it("Fallback für Unbekannte: Prefix strippen, CamelCase splitten, Kategorie other (sprachneutral)", () => {
    setLang("de");
    expect(describeMetric("HKQuantityTypeIdentifierDietaryZinc", "measure"))
      .toEqual({ name: "Dietary Zinc", category: "other", chartKind: "line" });
    setLang("en");
    expect(describeMetric("HKCategoryTypeIdentifierFooBar", "duration"))
      .toEqual({ name: "Foo Bar", category: "other", chartKind: "bar" });
  });

  it("kennt die häufigen Aktivitäts-Metriken (Welle 22): Kategorie activity, Name in beiden Sprachen", () => {
    const ids: Array<[string, "sum" | "measure", string, string]> = [
      ["HKQuantityTypeIdentifierPhysicalEffort", "measure", "Physical Effort", "Körperliche Anstrengung"],
      ["HKQuantityTypeIdentifierWalkingSpeed", "measure", "Walking Speed", "Gehgeschwindigkeit"],
      ["HKQuantityTypeIdentifierWalkingStepLength", "measure", "Walking Step Length", "Schrittlänge"],
      ["HKCategoryTypeIdentifierAppleStandHour", "sum", "Stand Hours", "Stehstunden"],
    ];
    for (const [id, policy, en, de] of ids) {
      setLang("en");
      expect(describeMetric(id, policy)).toMatchObject({ name: en, category: "activity" });
      setLang("de");
      expect(describeMetric(id, policy)).toMatchObject({ name: de, category: "activity" });
    }
  });
});
