import { policyFor } from "../../src/core/aggregation-policy";

describe("aggregation-policy", () => {
  it("kumulative Quantity-Typen → sum", () => {
    expect(policyFor("HKQuantityTypeIdentifierStepCount")).toBe("sum");
    expect(policyFor("HKQuantityTypeIdentifierActiveEnergyBurned")).toBe("sum");
  });
  it("unbekannter Quantity-Typ → measure (Default)", () => {
    expect(policyFor("HKQuantityTypeIdentifierHeartRate")).toBe("measure");
    expect(policyFor("HKQuantityTypeIdentifierWasWeissIch")).toBe("measure");
  });
  it("Kategorie-Typen → duration (Default)", () => {
    expect(policyFor("HKCategoryTypeIdentifierSleepAnalysis")).toBe("duration");
    expect(policyFor("HKCategoryTypeIdentifierIrgendwas")).toBe("duration");
  });
});
