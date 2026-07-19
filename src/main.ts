import { FileSystemAdapter, Notice, Plugin } from "obsidian";
import { join } from "node:path";
import { readdir, writeFile } from "node:fs/promises";
import { aggregateStream } from "./core/pipeline";
import { openImportSource, pickImportFile } from "./obsidian/health-source";

const CACHE_FILE = "health-cache.json";

export default class AppleHealthPlugin extends Plugin {
  onload(): void {
    this.addCommand({
      id: "import",
      name: "Import ausführen",
      callback: () => { void this.runImport(); },
    });
  }

  onunload(): void {}

  private async runImport(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) {
      new Notice("Apple Health: nur auf dem Desktop verfügbar.");
      return;
    }
    const pluginDir = join(adapter.getBasePath(), this.manifest.dir ?? "");
    const importDir = join(pluginDir, "import");

    let names: string[];
    try {
      names = await readdir(importDir);
    } catch {
      new Notice("Apple Health: Ordner 'import/' nicht gefunden.");
      return;
    }
    const file = pickImportFile(names);
    if (!file) {
      new Notice("Apple Health: keine .zip/.xml in 'import/' gefunden.");
      return;
    }

    new Notice(`Apple Health: Import von ${file} gestartet …`);
    try {
      const cache = await aggregateStream(
        openImportSource(join(importDir, file)),
        { sourceFile: file, importedAt: new Date().toISOString() },
        (records) => new Notice(`Apple Health: ${records.toLocaleString()} Records …`),
      );
      await writeFile(join(pluginDir, CACHE_FILE), JSON.stringify(cache), "utf8");
      const types = Object.keys(cache.metrics).length;
      new Notice(`Apple Health: fertig — ${cache.recordCount.toLocaleString()} Records, ${types} Metriken, ${cache.workouts.length} Workouts.`);
    } catch (e) {
      new Notice(`Apple Health: Import fehlgeschlagen — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
