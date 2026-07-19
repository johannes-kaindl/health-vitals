export interface StartTag {
  name: string;
  attrs: Record<string, string>;
  selfClosing: boolean;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ENTITIES[e]);
}

const NAME_RE = /^\s*([\w:.-]+)/;
const ATTR_RE = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

function parseAttrs(inner: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(inner)) !== null) {
    const val = m[2] !== undefined ? m[2] : (m[3] ?? "");
    attrs[m[1]] = decodeEntities(val);
  }
  return attrs;
}

// '>' innerhalb von Anführungszeichen ignorieren.
function findTagEnd(buf: string, lt: number): number {
  let quote: string | null = null;
  for (let j = lt + 1; j < buf.length; j++) {
    const ch = buf[j];
    if (quote) { if (ch === quote) quote = null; }
    else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ">") return j;
  }
  return -1;
}

// <!DOCTYPE …> darf ein internes Subset "[ … ]" mit eigenen '>' enthalten.
function findDeclEnd(buf: string, lt: number): number {
  let depth = 0;
  for (let j = lt + 2; j < buf.length; j++) {
    const ch = buf[j];
    if (ch === "[") depth++;
    else if (ch === "]") { if (depth > 0) depth--; }
    else if (ch === ">" && depth === 0) return j;
  }
  return -1;
}

function emitStartTag(inner: string, emit: (t: StartTag) => void): void {
  let selfClosing = false;
  let s = inner;
  if (s.endsWith("/")) { selfClosing = true; s = s.slice(0, -1); }
  const nm = NAME_RE.exec(s);
  if (!nm) return;
  emit({ name: nm[1], attrs: parseAttrs(s.slice(nm[0].length)), selfClosing });
}

export class XmlTokenizer {
  private buf = "";

  feed(chunk: string, emit: (t: StartTag) => void): void {
    this.buf += chunk;
    const buf = this.buf;
    const n = buf.length;
    let i = 0;
    while (i < n) {
      const lt = buf.indexOf("<", i);
      if (lt === -1) { i = n; break; }           // Rest ist Text
      const c = buf[lt + 1];
      if (c === undefined) { i = lt; break; }     // '<' am Ende → warten
      if (c === "/") {                            // Close-Tag
        const gt = buf.indexOf(">", lt);
        if (gt === -1) { i = lt; break; }
        i = gt + 1; continue;
      }
      if (c === "?") {                            // <?xml …?>
        const end = buf.indexOf("?>", lt);
        if (end === -1) { i = lt; break; }
        i = end + 2; continue;
      }
      if (c === "!") {                            // Kommentar oder DOCTYPE
        if (buf.startsWith("<!--", lt)) {
          const end = buf.indexOf("-->", lt);
          if (end === -1) { i = lt; break; }
          i = end + 3; continue;
        }
        const end = findDeclEnd(buf, lt);
        if (end === -1) { i = lt; break; }
        i = end + 1; continue;
      }
      const end = findTagEnd(buf, lt);            // Start-Tag
      if (end === -1) { i = lt; break; }          // unvollständig → warten
      emitStartTag(buf.slice(lt + 1, end), emit);
      i = end + 1;
    }
    this.buf = buf.slice(i);
  }

  end(): void { this.buf = ""; }
}
