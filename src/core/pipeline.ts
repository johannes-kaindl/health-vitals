import { XmlTokenizer, type StartTag } from "./xml-tokenizer";
import { eventFromTag } from "./health-parser";
import { Aggregator } from "./aggregator";
import type { HealthCache } from "./types";

export interface AggregateMeta { sourceFile: string; importedAt: string; }

/** Signalisiert den vom Nutzer ausgelösten Abbruch — kein Fehlerfall. */
export class ImportAbortedError extends Error {
  constructor() {
    super("Import aborted");
    this.name = "ImportAbortedError";
  }
}

export interface AggregateOptions {
  onProgress?: (records: number) => void;
  signal?: AbortSignal;
  /**
   * Wird periodisch awaited, damit der aufrufende Renderer zeichnen und Klicks
   * verarbeiten kann. Der Kern kennt keine Timer — der Aufrufer reicht sie herein.
   */
  yieldToUi?: () => Promise<void>;
  yieldEveryMs?: number;
}

export async function aggregateStream(
  chunks: AsyncIterable<string> | Iterable<string>,
  meta: AggregateMeta,
  opts: AggregateOptions = {},
): Promise<HealthCache> {
  const { onProgress, signal, yieldToUi, yieldEveryMs = 250 } = opts;
  const tok = new XmlTokenizer();
  const agg = new Aggregator();
  let seen = 0;
  let lastYield = Date.now();

  const handle = (tag: StartTag): void => {
    const e = eventFromTag(tag);
    if (!e) return;
    agg.add(e);
    if (e.kind === "record") seen++;
  };

  if (signal?.aborted) throw new ImportAbortedError();

  for await (const chunk of chunks as AsyncIterable<string>) {
    if (signal?.aborted) throw new ImportAbortedError();
    tok.feed(chunk, handle);

    // Ein Update pro Yield-Runde (~4/s bei yieldEveryMs=250) statt der früheren
    // 250k-Record-Meilensteine: In einer Live-Anzeige ist eine 10+ Sekunden
    // eingefrorene Zahl auf einer langsamen Maschine nicht von einem hängenden
    // Renderer zu unterscheiden — genau das, was die Live-Anzeige verhindern soll.
    // Ein zusätzlicher record-basierter Meilenstein daneben würde dieses Problem für
    // den einzigen echten Aufrufer (ImportController, der onProgress und yieldToUi
    // immer zusammen setzt) nicht lösen und nur zwei konkurrierende Update-Quellen
    // schaffen — deshalb ersatzlos gestrichen statt parallel weitergeführt.
    if (yieldToUi && Date.now() - lastYield >= yieldEveryMs) {
      lastYield = Date.now();
      onProgress?.(seen);
      await yieldToUi();
      if (signal?.aborted) throw new ImportAbortedError();
    }
  }

  if (signal?.aborted) throw new ImportAbortedError();
  tok.end();
  return agg.finalize(meta);
}
