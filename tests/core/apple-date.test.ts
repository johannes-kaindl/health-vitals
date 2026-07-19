import { localDay, durationMinutes, toEpochMs } from "../../src/core/apple-date";

describe("apple-date", () => {
  it("localDay nimmt die Wanduhr-Datumsteil (kein TZ-Rechnen)", () => {
    expect(localDay("2022-11-25 08:39:02 +0200")).toBe("2022-11-25");
    expect(localDay("2022-11-25 23:30:00 +0200")).toBe("2022-11-25"); // Tagesgrenze bleibt lokal
  });

  it("toEpochMs rechnet den Offset ein", () => {
    // 08:00 +0200 == 06:00 UTC
    expect(toEpochMs("2022-11-25 08:00:00 +0200")).toBe(Date.UTC(2022, 10, 25, 6, 0, 0));
  });

  it("durationMinutes über eine Stunde inkl. Tagesübergang", () => {
    expect(durationMinutes("2022-11-25 23:30:00 +0200", "2022-11-26 00:30:00 +0200")).toBe(60);
  });

  it("durationMinutes ist 0 bei unparsbaren Werten", () => {
    expect(durationMinutes("kaputt", "2022-11-26 00:30:00 +0200")).toBe(0);
  });
});
