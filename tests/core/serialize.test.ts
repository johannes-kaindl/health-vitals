import { toCsv, toMarkdownTable } from "../../src/core/serialize";

describe("toMarkdownTable", () => {
  it("Kopf, Trennzeile und Datenzeilen", () => {
    const md = toMarkdownTable(["Datum", "Wert"], [["2026-07-28", "72"]]);
    expect(md).toBe("| Datum | Wert |\n| --- | --- |\n| 2026-07-28 | 72 |");
  });

  it("Pipe in einer Zelle bleibt eine Zelle (re-escaped)", () => {
    const md = toMarkdownTable(["A"], [["x|y"]]);
    expect(md).toContain("| x\\|y |");
    // Ohne Escaping hätte die Datenzeile mehr Spalten als der Kopf.
    const cells = md.split("\n")[2].split(/(?<!\\)\|/).filter((c) => c.trim());
    expect(cells).toHaveLength(1);
  });

  it("ohne Zeilen bleiben Kopf und Trennzeile", () => {
    expect(toMarkdownTable(["A", "B"], [])).toBe("| A | B |\n| --- | --- |");
  });
});

describe("toCsv", () => {
  it("Kopf und Zeilen mit Komma getrennt", () => {
    expect(toCsv(["Datum", "Wert"], [["2026-07-28", "72"]])).toBe("Datum,Wert\n2026-07-28,72");
  });

  it("Zelle mit Komma wird gequotet", () => {
    expect(toCsv(["A"], [["1,5"]])).toBe('A\n"1,5"');
  });

  it("Anführungszeichen werden verdoppelt und die Zelle gequotet", () => {
    expect(toCsv(["A"], [['sagt "hallo"']])).toBe('A\n"sagt ""hallo"""');
  });

  it("Zeilenumbruch in einer Zelle wird gequotet", () => {
    expect(toCsv(["A"], [["a\nb"]])).toBe('A\n"a\nb"');
  });

  it("auch ein alleinstehendes Carriage Return wird gequotet", () => {
    // Die Einheiten in den Spaltenköpfen stammen aus dem Apple-Export, sind also
    // fremdbestimmt. Ein ungequotetes \r bricht CSV-Parser, die es als Zeilenende lesen.
    expect(toCsv(["A"], [["a\rb"]])).toBe('A\n"a\rb"');
  });

  it("harmlose Zellen bleiben unquotiert", () => {
    expect(toCsv(["A"], [["72.5"]])).toBe("A\n72.5");
  });
});
