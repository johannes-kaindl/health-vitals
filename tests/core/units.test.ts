import { toKcal, toKm, toMinutes } from "../../src/core/units";

describe("units", () => {
  it("toKm rechnet die im Export vorkommenden Längeneinheiten um", () => {
    expect(toKm(5, "km")).toBe(5);
    expect(toKm(1500, "m")).toBe(1.5);
    expect(toKm(1, "mi")).toBeCloseTo(1.609344, 6);
    expect(toKm(1000, "yd")).toBeCloseTo(0.9144, 4);
  });

  it("toKcal rechnet Energie um; kJ durch 4,184", () => {
    expect(toKcal(600, "kcal")).toBe(600);
    expect(toKcal(600, "Cal")).toBe(600);
    expect(toKcal(4184, "kJ")).toBeCloseTo(1000, 6);
  });

  it("toMinutes rechnet Dauern um", () => {
    expect(toMinutes(30.5, "min")).toBe(30.5);
    expect(toMinutes(90, "s")).toBe(1.5);
    expect(toMinutes(1.5, "h")).toBe(90);
  });

  // Der Kern der Regel: lieber keine Zahl als eine falsche. Eine unbekannte Einheit
  // stillschweigend als Basiseinheit zu behandeln, hiesse bei "mi" um 61 % danebenzuliegen.
  it("unbekannte Einheit → null, nicht der ungeprüfte Rohwert", () => {
    expect(toKm(5, "furlong")).toBeNull();
    expect(toKm(5, "")).toBeNull();
    expect(toKcal(5, "J")).toBeNull();
    expect(toMinutes(5, "d")).toBeNull();
  });

  it("nicht-endlicher Wert → null", () => {
    expect(toKm(Number.NaN, "km")).toBeNull();
    expect(toKcal(Number.POSITIVE_INFINITY, "kcal")).toBeNull();
  });

  it("Laengen- und Dauereinheiten sind case-insensitiv, Leerraum wird getrimmt", () => {
    expect(toKm(5, " KM ")).toBe(5);
    expect(toMinutes(30, "MIN")).toBe(30);
    expect(toKcal(600, " kcal ")).toBe(600);
  });

  // 1 Cal = 1000 cal = 1 kcal — die Grossschreibung ist hier die ganze Aussage.
  it("Energieeinheiten unterscheiden Gross- und Kleinschreibung", () => {
    expect(toKcal(600, "Cal")).toBe(600);
    expect(toKcal(600, "cal")).toBeCloseTo(0.6, 9);
    expect(toKcal(600, "KCAL")).toBeNull();
  });
});
