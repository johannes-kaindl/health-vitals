import { describeMetric } from "../../src/core/metric-catalog";

describe("metric-catalog", () => {
  it("kennt kuratierte Identifier mit deutschem Namen + Kategorie", () => {
    expect(describeMetric("HKQuantityTypeIdentifierStepCount", "sum"))
      .toEqual({ name: "Schritte", category: "Aktivität", chartKind: "bar" });
    expect(describeMetric("HKQuantityTypeIdentifierBodyMass", "measure"))
      .toEqual({ name: "Gewicht", category: "Körper", chartKind: "line" });
  });

  it("leitet chartKind aus der Policy ab, wenn der Katalog keinen Override hat", () => {
    // measure → line, sum/duration → bar
    expect(describeMetric("HKQuantityTypeIdentifierHeartRate", "measure").chartKind).toBe("line");
    expect(describeMetric("HKCategoryTypeIdentifierMindfulSession", "duration").chartKind).toBe("bar");
  });

  it("Fallback für Unbekannte: Prefix strippen, CamelCase splitten, Kategorie Sonstige", () => {
    expect(describeMetric("HKQuantityTypeIdentifierDietaryZinc", "measure"))
      .toEqual({ name: "Dietary Zinc", category: "Sonstige", chartKind: "line" });
    expect(describeMetric("HKCategoryTypeIdentifierFooBar", "duration"))
      .toEqual({ name: "Foo Bar", category: "Sonstige", chartKind: "bar" });
  });
});
