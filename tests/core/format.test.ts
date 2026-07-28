import { formatValue, formatDuration, formatTickLabel } from "../../src/core/format";
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

describe("formatTickLabel", () => {
  // Das Test-Setup setzt "de"; die Zeitzone der Suite ist America/New_York.
  it("Tag: zeigt den Tag des Schlüssels, nicht den Vortag (UTC-Fallstrick)", () => {
    const label = formatTickLabel("2026-07-28", "day");
    expect(label).toContain("28");
    expect(label).toContain("07");
    expect(label).not.toContain("27");
  });

  it("Woche: Kalenderwoche aus dem Schlüssel, ohne führende Null", () => {
    expect(formatTickLabel("2026-W30", "week")).toBe("KW 30");
    expect(formatTickLabel("2026-W05", "week")).toBe("KW 5");
  });

  it("Monat: Kurzmonat und zweistelliges Jahr", () => {
    const label = formatTickLabel("2026-07", "month");
    expect(label).toMatch(/Jul/);
    expect(label).toContain("26");
  });

  it("Monat: auch lange Monatsnamen bleiben kurz", () => {
    // Achtung, ICU-Falle: `{ month: "short", year: "2-digit" }` in EINEM Aufruf
    // wählt im Deutschen ein längeres Muster ("Sept. 26", "Juli 26", "März 26").
    // Nur getrennt formatiert kommt das echte Kurzmuster heraus. Dieser Test
    // fällt, sobald jemand die beiden Aufrufe wieder zusammenlegt.
    expect(formatTickLabel("2026-09", "month")).not.toContain(".");
    expect(formatTickLabel("2026-09", "month").length).toBeLessThanOrEqual(7);
    expect(formatTickLabel("2026-03", "month").length).toBeLessThanOrEqual(7);
  });

  it("Woche auf Englisch nutzt den englischen Präfix", () => {
    setLang("en");
    expect(formatTickLabel("2026-W30", "week")).toBe("W 30");
    setLang("de");
  });

  it("Tag und Monat auf Englisch", () => {
    // Das englische Tagesformat ist strukturell ein anderes (07/28 statt 28.07.) und war
    // bislang unbelegt — die deutschen Tests decken es nicht mit ab.
    setLang("en");
    const day = formatTickLabel("2026-07-28", "day");
    expect(day).toContain("28");
    expect(day).toContain("07");
    expect(day).not.toContain("27"); // UTC-Fallstrick gilt in jeder Sprache
    const month = formatTickLabel("2026-07", "month");
    expect(month).toMatch(/Jul/);
    expect(month).toContain("26");
    setLang("de");
  });

  it("Wochenschlüssel ohne Wochenmarke ergibt kein 'KW NaN'", () => {
    expect(formatTickLabel("2026-07-28", "week")).not.toContain("NaN");
  });

  it("Monatswechsel am 1. bleibt im richtigen Monat", () => {
    // Ohne timeZone: "UTC" läge dieser Tag in New York noch im Juni.
    const label = formatTickLabel("2026-07-01", "day");
    expect(label).toContain("07");
    expect(label).not.toContain("06");
  });
});
