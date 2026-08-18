import { XmlTokenizer, decodeEntities, type Token } from "../../src/core/xml-tokenizer";

function collect(input: string, chunkSize = input.length): Token[] {
  const tok = new XmlTokenizer();
  const out: Token[] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    tok.feed(input.slice(i, i + chunkSize), (t) => out.push(t));
  }
  tok.end();
  return out;
}

// Bestehende Tests: `collect(DOC)` → `starts(DOC)`.
function starts(input: string, chunkSize = input.length) {
  return collect(input, chunkSize).filter((t) => t.kind === "start");
}

const DOC = `<?xml version="1.0"?>
<!DOCTYPE HealthData [ <!ELEMENT HealthData (Record)*> ]>
<HealthData locale="de_DE">
 <Record type="A" unit="count" value="1"/>
 <Record type="B" device="&lt;&lt;HKDevice&gt;" value="2">
  <MetadataEntry key="k" value="v"/>
 </Record>
</HealthData>`;

describe("xml-tokenizer", () => {
  it("decodeEntities löst die 5 XML-Entities", () => {
    expect(decodeEntities("&lt;a&gt;&amp;&quot;&apos;")).toBe(`<a>&"'`);
  });

  it("emittiert Start-Tags, überspringt Decl/DOCTYPE/Close/Text", () => {
    const tags = starts(DOC).map((t) => t.name);
    expect(tags).toEqual(["HealthData", "Record", "Record", "MetadataEntry"]);
  });

  it("erkennt self-closing vs Container und dekodiert Attribute", () => {
    const tags = starts(DOC);
    const a = tags.find((t) => t.attrs.type === "A")!;
    const b = tags.find((t) => t.attrs.type === "B")!;
    expect(a.selfClosing).toBe(true);
    expect(b.selfClosing).toBe(false);
    expect(b.attrs.device).toBe("<<HKDevice>");
  });

  it("ist chunk-grenzen-robust (jede Split-Größe → identische Tokens)", () => {
    const whole = JSON.stringify(starts(DOC));
    for (const size of [1, 2, 3, 7, 13, 50]) {
      expect(JSON.stringify(starts(DOC, size))).toBe(whole);
    }
  });

  it("überspringt XML-Kommentare vollständig (auch mit > im Kommentar)", () => {
    const withComment = `<Record type="A" value="1"/><!-- a comment with > inside -->
<Record type="B" value="2"/>`;
    const tags = starts(withComment);
    const names = tags.map((t) => t.name);
    expect(names).toEqual(["Record", "Record"]);
    expect(tags[0].attrs.type).toBe("A");
    expect(tags[1].attrs.type).toBe("B");
  });

  it("ist chunk-grenzen-robust bei Kommentaren", () => {
    const withComment = `<Record type="A" value="1"/><!-- a comment with > inside -->
<Record type="B" value="2"/>`;
    const whole = JSON.stringify(starts(withComment));
    for (const size of [1, 2, 3, 5, 7]) {
      expect(JSON.stringify(starts(withComment, size))).toBe(whole);
    }
  });

  it("meldet End-Tags als eigenes Token, in Dokumentreihenfolge", () => {
    const seq = collect(`<Workout a="1"><WorkoutStatistics b="2"/></Workout>`)
      .map((t) => (t.kind === "start" ? `<${t.name}>` : `</${t.name}>`));
    expect(seq).toEqual(["<Workout>", "<WorkoutStatistics>", "</Workout>"]);
  });

  it("selbstschließendes Element meldet kein End-Token", () => {
    const seq = collect(`<Workout a="1"/>`);
    expect(seq).toHaveLength(1);
    expect(seq[0].kind).toBe("start");
    expect(seq[0].kind === "start" && seq[0].selfClosing).toBe(true);
  });

  it("ist chunk-grenzen-robust auch für End-Tags", () => {
    const doc = `<Workout a="1"><WorkoutStatistics b="2"/></Workout>`;
    const whole = JSON.stringify(collect(doc));
    for (const size of [1, 2, 3, 7, 13]) {
      expect(JSON.stringify(collect(doc, size))).toBe(whole);
    }
  });
});
