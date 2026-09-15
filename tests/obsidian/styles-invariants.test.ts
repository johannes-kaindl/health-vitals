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

describe("styles.css — Hub-Tab-Leiste bricht um (uebernommen aus obsidian-kit HUB_CSS)", () => {
  // Vier Zutaten, jede einzeln wirkungslos — der Modulkopf von obsidian-kit
  // `src/vendor/kit-obsidian/hub.ts` begruendet sie im Detail. Ohne sie schiebt eine
  // schmale Sidebar die letzten Tabs aus dem Panel, wo sie unerreichbar sind; vault-rag
  // und vim-dojo haben genau das unabhaengig voneinander gefunden.
  //
  // Seit Welle 2 (Kit-Pin 0.35.0) baut buildHubInto die Leiste selbst
  // (okit-hub-tabs/okit-hub-tab/-label/-icon statt des vorherigen Eigenbaus
  // ah-tabbar/ah-tab); das CSS bleibt trotzdem Sache des Consumers, das Kit injiziert
  // bewusst keines. Warum als Test und nicht nur als Kommentar: eine Kopie ohne Waechter
  // ist genau das, was beim naechsten Umbau still verschwindet — und der Fehler zeigt
  // sich erst in schmaler Sidebar, also nicht dort, wo jemand hinsieht.
  //
  // Was der Test NICHT kann: beweisen, dass die Leiste tatsaechlich umbricht. Das
  // entscheidet das echte Rendering; hier steht nur, dass die Zutaten nicht verlorengehen.
  it("(1) die Leiste darf eine zweite Zeile bilden", () => {
    expect(rule(".okit-hub-tabs")).toMatch(/flex-wrap:\s*wrap/);
  });

  it("(2)+(3) der Tab geht mit seiner Inhaltsbreite in die Umbruch-Entscheidung ein", () => {
    const tab = rule(".okit-hub-tab");
    expect(tab).toMatch(/flex:\s*1\s+1\s+auto/);
    // min-width:auto waere min-content — ein langes Label sprengte die Zeile trotz wrap.
    expect(tab).toMatch(/min-width:\s*0/);
  });

  it("(4) das Label ellipsiert, statt aus dem geschrumpften Tab zu quellen", () => {
    const label = rule(".okit-hub-tab-label");
    expect(label).toBeTruthy();
    expect(label).toMatch(/overflow:\s*hidden/);
    expect(label).toMatch(/text-overflow:\s*ellipsis/);
    expect(label).toMatch(/white-space:\s*nowrap/);
  });

  it("das Icon schrumpft nicht mit — sonst frisst ein langes Label es auf", () => {
    expect(rule(".okit-hub-tab-icon")).toMatch(/flex:\s*0\s+0\s+auto/);
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

describe("styles.css — Schlafphasen", () => {
  const STAGES = ["deep", "core", "rem", "unspecified"];

  it("jede Phase hat eine eigene Fuellfarbe aus Theme-Variablen", () => {
    // Geprueft wird die ABSICHT (der Wert stammt aus dem Theme), nicht die Form: seit
    // 2026-08-18 ist `core` ein `color-mix(...)` aus zwei Variablen, weil `--color-cyan`
    // allein in hellen Belegungen 2,29:1 erreichte. Ein Test auf "beginnt mit var(" haette
    // diesen Fix blockiert, ohne dass an ihm etwas falsch waere — die Regel lautet "keine
    // hartkodierten Farben", und die haelt ein color-mix aus Variablen ein.
    for (const stage of STAGES) {
      const decl = rule(`.ah-stage-${stage}`);
      expect(decl, stage).toMatch(/fill:[^;]*var\(--/);
    }
  });

  it("keine Phase traegt eine hartkodierte Farbe", () => {
    // PROF-OBS / UI-STANDARD: das Plugin muss in jedem Theme funktionieren, und der
    // Store-Scanner liest die Deklaration, nicht den Kommentar daneben.
    for (const stage of STAGES) {
      expect(rule(`.ah-stage-${stage}`), stage).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });

  it("die vier Phasen sind paarweise verschieden eingefaerbt", () => {
    // Zwei Phasen mit derselben Variablen waeren im Stapel nicht trennbar — und der
    // Fehler faellt am Bildschirm erst auf, wenn beide zufaellig aneinandergrenzen.
    const fills = STAGES.map((s) => (rule(`.ah-stage-${s}`).match(/fill:\s*([^;]+)/) ?? [])[1]?.trim());
    expect(new Set(fills).size).toBe(STAGES.length);
  });

  it("der Legenden-Swatch erbt dieselbe Farbe wie das Segment", () => {
    // Die Legende ist nur dann eine Legende, wenn sie die Farbe des Charts zeigt.
    // Deshalb faerbt EINE Regel je Phase beides ein — geteilt ueber `fill` plus
    // `background-color` im selben Block, nicht zwei Deklarationen, die auseinanderlaufen.
    for (const stage of STAGES) {
      expect(rule(`.ah-stage-${stage}`), stage).toMatch(/background-color:[^;]*var\(--/);
    }
  });
});

describe("styles.css — Chart-Masse haengen am Chart, nicht am Ort", () => {
  // Der Fund aus dem Smoke-Test 2026-08-18: Das Phasen-Chart rendert vollstaendig und
  // rechnerisch korrekt, ist aber unsichtbar — die einzige Regel, die einem Chart-SVG
  // Masse gibt, hing an `.ah-detail-chart`, also am Container des Detail-Tabs. Eine neue
  // Chart-Stelle mit eigenem Container erbt sie nicht. Kein Test konnte das sehen: die
  // <rect>-Elemente entstehen, sie haben nur keine Flaeche.
  it("die Chart-Klasse selbst traegt Breite, Hoehe und display", () => {
    const chart = rule(".ah-chart");
    expect(chart).toMatch(/width:/);
    expect(chart).toMatch(/height:/);
    expect(chart).toMatch(/display:/);
  });

  it("kein Tab-Container definiert mehr die Chart-Masse", () => {
    // Sonst gilt die Kopplung weiter und die naechste Chart-Stelle faellt erneut hinein.
    // Ausgenommen bleibt die Sparkline: ihre feste Hoehe ist ein bewusster Sonderfall,
    // kein Ortsbezug — sie ueberschreibt die Basisregel absichtlich.
    expect(CSS).not.toMatch(/\.ah-detail-chart\s+svg\s*\{/);
  });

  it("die Sparkline ueberschreibt die Basis, statt sie zu ersetzen", () => {
    // Spezifitaet: `.ah-tile-spark svg` (0,1,1) schlaegt `.ah-chart` (0,1,0) — die feste
    // 36px bleiben also gueltig, ohne dass die Reihenfolge im Stylesheet daran haengt.
    expect(rule(".ah-tile-spark svg")).toMatch(/height:\s*36px/);
  });
});

describe("styles.css — Segmentfarben brauchen eine Kontrastzusage", () => {
  it("keine Phase nutzt eine background-modifier-Variable als Fuellfarbe", () => {
    // Gemessen am 2026-08-18 im laufenden Obsidian: `--background-modifier-border` kam
    // auf 1,06:1 gegen `--background-primary` — unsichtbar. Der Fehler ist die Gattung,
    // nicht der Wert: Eine Rahmenvariable ist fuer duenne Linien gedacht und gibt keinem
    // Theme eine Kontrastzusage gegen den Hintergrund. Text- und Farbvariablen tun das,
    // weil ein Theme sonst unlesbar waere. Bei „Alles" traf es 68 % der Flaeche.
    for (const stage of ["deep", "core", "rem", "unspecified"]) {
      expect(rule(`.ah-stage-${stage}`), stage).not.toMatch(/var\(--background-modifier/);
    }
  });
});
