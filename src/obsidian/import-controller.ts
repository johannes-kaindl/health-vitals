import { aggregateStream, ImportAbortedError } from "../core/pipeline";
import {
  IDLE, started, progressed, phaseChanged, finished, aborted, failed,
  type ImportState,
} from "../core/import-state";
import type { HealthCache } from "../core/types";
import { openImportSource } from "./health-source";

export interface ImportControllerHost {
  writeCache(cache: HealthCache): Promise<void>;
}

/**
 * Kapselt einen Import-Lauf: Abbruch-Steuerung, Zustandsübergänge, Cache-Write.
 * Enthält bewusst kein DOM — die View abonniert nur `onState`.
 */
export class ImportController {
  private current: ImportState = IDLE;
  private controller: AbortController | null = null;

  constructor(
    private readonly host: ImportControllerHost,
    private readonly onState: (state: ImportState) => void,
  ) {}

  get state(): ImportState { return this.current; }

  abort(): void { this.controller?.abort(); }

  async start(file: File): Promise<void> {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.emit(started(file.name));

    // Bricht der Nutzer ab, muss die UI das sofort sehen — nicht erst, wenn der
    // Stream den nächsten Chunk erreicht.
    signal.addEventListener("abort", () => { this.emit(aborted(this.current)); }, { once: true });

    try {
      const cache = await aggregateStream(
        openImportSource(file),
        { sourceFile: file.name, importedAt: new Date().toISOString() },
        {
          signal,
          onProgress: (records) => {
            this.emit(phaseChanged(progressed(this.current, records), "parsing"));
          },
          // Gibt den Renderer periodisch frei, damit Fortschritt sichtbar bleibt
          // und der Abbrechen-Button überhaupt Klicks verarbeiten kann.
          yieldToUi: () => new Promise<void>((r) => { activeWindow.setTimeout(r, 0); }),
        },
      );

      if (signal.aborted) return;
      this.emit(phaseChanged(this.current, "writing"));
      await this.host.writeCache(cache);
      this.emit(finished(cache.recordCount));
    } catch (e) {
      if (e instanceof ImportAbortedError || signal.aborted) {
        this.emit(aborted(this.current));
        return;
      }
      this.emit(failed(this.current, e instanceof Error ? e.message : String(e)));
    } finally {
      this.controller = null;
    }
  }

  private emit(next: ImportState): void {
    this.current = next;
    this.onState(next);
  }
}
