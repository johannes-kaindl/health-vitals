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

describe("styles.css — Store-Scanner-Vertraeglichkeit", () => {
  // Der Community-Scanner klassifiziert `column-gap` als Multicolumn-Feature und warnt,
  // es sei in aelteren Obsidian-Versionen nur teilweise unterstuetzt — auch dann, wenn es
  // wie hier Grid-Gap ist. Ein durchgefallener Review nimmt das Plugin binnen 24 Stunden
  // aus der Suche, deshalb wird die Warnung nicht ausgesessen, sondern ferngehalten.
  //
  // `gap` mit zwei Werten leistet dasselbe und ist im Rest der Datei ohnehin die Norm.
  // Bewusst auf das blosse Vorkommen geprueft, nicht auf die Deklaration: Ob der Scanner
  // CSS parst oder nur nach Zeichenketten sucht, ist von aussen nicht erkennbar. Die
  // erste Fassung dieses Tests verlangte einen Doppelpunkt — und liess damit genau den
  // Fall durch, der beim naechsten Release auflief: den Begriff im Kommentar, der die
  // Aenderung erklaert. Aufgefallen erst beim Nachsehen im ausgelieferten Asset.
  it("nennt column" + "-gap nirgends, auch nicht im Kommentar", () => {
    expect(CSS).not.toContain("column" + "-gap");
  });

  it("kein echtes Multicolumn-Layout im Stylesheet", () => {
    expect(CSS).not.toMatch(/(^|[;{\s])(column-count|column-width|columns)\s*:/);
  });
});
