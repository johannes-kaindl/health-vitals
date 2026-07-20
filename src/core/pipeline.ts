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
  /**
   * Feuert zeitgetaktet (höchstens alle `yieldEveryMs`), nicht pro Record und nicht
   * an Record-Meilensteinen. Läuft über eine eigene Zeitschranke, unabhängig davon,
   * ob `yieldToUi` gesetzt ist — ein Aufrufer, der nur Fortschritt loggen will (z. B.
   * ein CLI/Batch-Pfad ohne Renderer), bekommt Aufrufe, ohne `yieldToUi` mitliefern zu
   * müssen. Es gibt keinen abschließenden Aufruf nach dem letzten Chunk: Den finalen
   * Record-Stand liefert der Rückgabewert (`HealthCache.recordCount`).
   */
  onProgress?: (records: number) => void;
  signal?: AbortSignal;
  /**
   * Wird periodisch awaited, damit der aufrufende Renderer zeichnen und Klicks
   * verarbeiten kann. Der Kern kennt keine Timer — der Aufrufer reicht sie herein.
   * Teilt sich `yieldEveryMs` mit `onProgress`, läuft aber über eine eigene
   * Zeitschranke — nur gesetzt, wenn `yieldToUi` selbst gesetzt ist.
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
  const start = Date.now();
  let lastYield = start;
  let lastProgress = start;

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

    // Ein Update pro Zeitfenster (~4/s bei yieldEveryMs=250) statt der früheren
    // 250k-Record-Meilensteine: In einer Live-Anzeige ist eine 10+ Sekunden
    // eingefrorene Zahl auf einer langsamen Maschine nicht von einem hängenden
    // Renderer zu unterscheiden — genau das, was die Live-Anzeige verhindern soll.
    // Ein zusätzlicher record-basierter Meilenstein daneben würde dieses Problem für
    // den heutigen Aufrufer (ImportController, der onProgress und yieldToUi immer
    // zusammen setzt) nicht lösen und nur zwei konkurrierende Update-Quellen
    // schaffen — deshalb ersatzlos gestrichen statt parallel weitergeführt.
    //
    // onProgress und yieldToUi haben je eine eigene Zeitschranke (beide standardmäßig
    // `yieldEveryMs`), damit ein Aufrufer, der nur Fortschritt will, keine
    // Renderer-Yield-Funktion mitliefern muss — und umgekehrt. Bei einem Aufrufer,
    // der beides zusammen setzt (heute: ImportController), feuern beide Schranken
    // synchron, weil sie mit demselben Startzeitpunkt und derselben Schrittweite
    // laufen — die Kadenz bleibt für diesen Fall unverändert.
    const nowTs = Date.now();
    if (onProgress && nowTs - lastProgress >= yieldEveryMs) {
      lastProgress = nowTs;
      onProgress(seen);
    }
    if (yieldToUi && nowTs - lastYield >= yieldEveryMs) {
      lastYield = nowTs;
      await yieldToUi();
      if (signal?.aborted) throw new ImportAbortedError();
    }
  }

  if (signal?.aborted) throw new ImportAbortedError();
  tok.end();
  return agg.finalize(meta);
}
