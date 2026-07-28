import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const CSS = readFileSync(fileURLToPath(new URL("../../styles.css", import.meta.url)), "utf8");

function rule(selector: string): string {
  const m = CSS.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : "";
}

describe("styles.css — Design-Invarianten", () => {
  // Was dieser Test kann: festhalten, dass die Wochenmarkierung sich in der FORM vom
  // Gitter unterscheidet. Was er NICHT kann: beweisen, dass sie sichtbar ist — das
  // entscheidet erst das echte Rendering im Theme des Nutzers.
  //
  // Hintergrund: Der erste Entwurf gab der Wochenlinie dieselbe Farbe wie den
  // Gitterlinien, dazu opacity 0.5. Im Smoke-Test war sie dadurch nicht auffindbar,
  // obwohl alle 13 Linien nachweislich an der richtigen Stelle gerendert wurden.
  // Eine bedeutungstragende Markierung darf nicht schwächer sein als die neutrale
  // Lesehilfe, gegen die sie sich abheben soll.
  it("Wochenlinie unterscheidet sich per Strichmuster, nicht nur per Deckkraft", () => {
    const week = rule(".ah-chart-week");
    expect(week).toBeTruthy();
    expect(week).toMatch(/stroke-dasharray/);
  });

  it("Wochenlinie ist nicht durch Transparenz abgeschwächt", () => {
    expect(rule(".ah-chart-week")).not.toMatch(/opacity/);
  });

  it("Gitterlinie bleibt durchgezogen — sonst sind beide ununterscheidbar", () => {
    expect(rule(".ah-chart-grid")).not.toMatch(/stroke-dasharray/);
  });
});
