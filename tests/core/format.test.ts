import { formatValue, formatDuration } from "../../src/core/format";
import { setLang } from "../../src/vendor/kit/i18n";

describe("formatDuration", () => {
  it("unter 60 Minuten: gerundete Minuten", () => {
    expect(formatDuration(38.42231736580531)).toBe("38 min");
    expect(formatDuration(7.006)).toBe("7 min");
  });
  it("ab 60 Minuten: Stunden + Minuten", () => {
    expect(formatDuration(95.5)).toBe("1h 36m"); // 96 min
    expect(formatDuration(60)).toBe("1h 0m");
  });
  it("sehr kurze Dauer rundet nicht auf 0", () => {
    expect(formatDuration(0.4)).toBe("< 1 min");
  });
});

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
  it("EN: Tausender-Komma statt Punkt", () => {
    setLang("en");
    expect(formatValue(8432, "count")).toBe("8,432 count");
    expect(formatValue(78.53, "kg")).toBe("78.5 kg");
  });
});
