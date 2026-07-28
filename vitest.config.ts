import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    // Bewusst NICHT UTC: Die Datums-Formatierung (formatTickLabel) und die
    // Tagesbildung (apple-date.ts) sind nur dann beweisbar korrekt, wenn die
    // Testumgebung eine andere Zonenlage hat als die verarbeiteten Daten.
    // In UTC sieht fehlerhafter Code identisch zu korrektem aus.
    env: { TZ: "America/New_York" },
  },
  resolve: {
    alias: {
      // Mock-Alias gehoert in vitest, NIE in tsconfig.json (PROF-OBS-08):
      obsidian: fileURLToPath(new URL("./tests/__mocks__/obsidian.ts", import.meta.url)),
    },
  },
});
