import { XmlTokenizer, type Token } from "./xml-tokenizer";
import { EventReader } from "./health-parser";
import { Aggregator } from "./aggregator";
import type { HealthCache } from "./types";
import { createCooperativeYield } from "../vendor/kit/cooperative-yield";

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

/**
 * Beide Schranken samt ihrer Synchronitäts-Zusage liegen seit Kit 0.27.0 in
 * `vendor/kit/cooperative-yield.ts` — die Mechanik (eine Uhr-Lesung für beide Barrieren,
 * eine Lesung pro Runde, Stempel VOR dem `await`) ist dort im Modulkopf beschrieben und
 * wird hier bewusst nicht ein zweites Mal geführt. Namen und Defaults von
 * `AggregateOptions` bleiben unverändert; nur die Rechnung dahinter ist jetzt geteilt.
 */

export async function aggregateStream(
  chunks: AsyncIterable<string> | Iterable<string>,
  meta: AggregateMeta,
  opts: AggregateOptions = {},
): Promise<HealthCache> {
  const { onProgress, signal, yieldToUi, yieldEveryMs = 250 } = opts;
  const tok = new XmlTokenizer();
  const agg = new Aggregator();
  let seen = 0;
  const pacer = createCooperativeYield({ yieldToUi, everyMs: yieldEveryMs });

  const reader = new EventReader();
  const handle = (tok_: Token): void => {
    const e = reader.push(tok_);
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
    //
    // Ans ENDE JEDER Iteration, in JEDEM Ausgang — der Rückgabewert von `tick()` sagt,
    // ob in dieser Runde tatsächlich geyieldet wurde, und ist damit der Anker für die
    // Abbruch-Nachprüfung, die vorher IM Yield-Block stand.
    if (await pacer.tick(() => onProgress?.(seen)) && signal?.aborted) throw new ImportAbortedError();
  }

  if (signal?.aborted) throw new ImportAbortedError();
  tok.end();
  return agg.finalize(meta);
}
