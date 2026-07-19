import { XmlTokenizer, type StartTag } from "./xml-tokenizer";
import { eventFromTag } from "./health-parser";
import { Aggregator } from "./aggregator";
import type { HealthCache } from "./types";

export interface AggregateMeta { sourceFile: string; importedAt: string; }

const PROGRESS_EVERY = 250_000;

export async function aggregateStream(
  chunks: AsyncIterable<string> | Iterable<string>,
  meta: AggregateMeta,
  onProgress?: (records: number) => void,
): Promise<HealthCache> {
  const tok = new XmlTokenizer();
  const agg = new Aggregator();
  let seen = 0;

  const handle = (tag: StartTag): void => {
    const e = eventFromTag(tag);
    if (!e) return;
    agg.add(e);
    if (e.kind === "record") {
      seen++;
      if (onProgress && seen % PROGRESS_EVERY === 0) onProgress(seen);
    }
  };

  for await (const chunk of chunks as AsyncIterable<string>) {
    tok.feed(chunk, handle);
  }
  tok.end();
  return agg.finalize(meta);
}
