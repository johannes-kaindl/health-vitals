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

  /**
   * Schreiben ist der Punkt ohne Umkehr: Das Parsen ist abgeschlossen, der Cache ist
   * ein vollständiges, korrektes Ergebnis, das gerade auf die Platte fließt — es gibt
   * nichts Halbfertiges mehr zu verwerfen. Einen Abbruch hier zu akzeptieren würde
   * entweder einen verwaisten Cache auf der Platte hinterlassen, während die UI
   * "abgebrochen" meldet, oder erfordern, eine gerade geschriebene Datei wieder zu
   * löschen. Der Abbruch wird daher verworfen — das hält Platten-Zustand und
   * gemeldeten Zustand konsistent, und genau das ist es, was dem Nutzer wichtig ist.
   */
  abort(): void {
    if (this.current.status === "running" && this.current.phase === "writing") return;
    this.controller?.abort();
  }

  async start(file: File): Promise<void> {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    // Nur eine direkt gewählte .zip durchläuft eine Entpack-Phase — eine .xml geht
    // sofort ins Parsen (siehe Spec: "phase ist eine von drei: unzipping (nur bei .zip)").
    this.emit(started(file.name, file.name.endsWith(".zip") ? "unzipping" : "parsing"));

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
          // `window.setTimeout` (nicht `activeWindow`) — der Store-Scanner verlangt
          // `window` für Timer-Funktionen. `window` ist im node-Testenvironment
          // undefiniert; ein Test, der diesen Zweig erreicht (Fixture groß genug für
          // > yieldEveryMs), braucht einen `window`-Alias aus einer vitest-Setup-Datei.
          // Heute erreicht kein Test den Pfad, daher ist keine nötig.
          yieldToUi: () => new Promise<void>((r) => { window.setTimeout(r, 0); }),
        },
      );

      // aggregateStream prüft `signal.aborted` selbst nach der Schleife und wirft in
      // dem Fall ImportAbortedError, statt normal zurückzukehren (siehe pipeline.ts) —
      // dieser Guard ist über den echten Code-Pfad heute daher unerreichbar. Er bleibt
      // als Verteidigung gegen eine künftige Änderung an aggregateStream (z. B. ein
      // await zwischen dem letzten Signal-Check und dem return), die diesen Fall doch
      // erreichbar machen würde. Bewusst nicht entfernt.
      if (signal.aborted) return;
      this.emit(phaseChanged(this.current, "writing"));
      await this.host.writeCache(cache);
      this.emit(finished(this.current, cache.recordCount));
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
