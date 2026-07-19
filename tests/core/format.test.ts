import { formatValue } from "../../src/core/format";

describe("formatValue", () => {
  it("de-DE Tausenderpunkt + Einheit angehängt", () => {
    expect(formatValue(8432, "count")).toBe("8.432 count");
  });
  it("Dezimalkomma, eine Nachkommastelle bei kleinen Werten", () => {
    expect(formatValue(78.53, "kg")).toBe("78,5 kg");
  });
  it("große Werte gerundet (keine Nachkommastelle ab |n|>=100)", () => {
    expect(formatValue(2100.4, "kcal")).toBe("2.100 kcal");
  });
  it("ohne Einheit nur die Zahl", () => {
    expect(formatValue(42, "")).toBe("42");
  });
});
