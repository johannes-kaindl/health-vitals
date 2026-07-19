import { XmlTokenizer, decodeEntities, type StartTag } from "../../src/core/xml-tokenizer";

function collect(input: string, chunkSize = input.length): StartTag[] {
  const tok = new XmlTokenizer();
  const out: StartTag[] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    tok.feed(input.slice(i, i + chunkSize), (t) => out.push(t));
  }
  tok.end();
  return out;
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
    const tags = collect(DOC).map((t) => t.name);
    expect(tags).toEqual(["HealthData", "Record", "Record", "MetadataEntry"]);
  });

  it("erkennt self-closing vs Container und dekodiert Attribute", () => {
    const tags = collect(DOC);
    const a = tags.find((t) => t.attrs.type === "A")!;
    const b = tags.find((t) => t.attrs.type === "B")!;
    expect(a.selfClosing).toBe(true);
    expect(b.selfClosing).toBe(false);
    expect(b.attrs.device).toBe("<<HKDevice>");
  });

  it("ist chunk-grenzen-robust (jede Split-Größe → identische Tokens)", () => {
    const whole = JSON.stringify(collect(DOC));
    for (const size of [1, 2, 3, 7, 13, 50]) {
      expect(JSON.stringify(collect(DOC, size))).toBe(whole);
    }
  });
});
