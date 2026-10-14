// Dünner Alias-Ziel für vitest (PROF-OBS-08): re-exportiert den vendorten Kit-Mock.
// Plugin-eigene Stubs kommen hier als Override dazu, sobald ein Test sie braucht.
export * from "../vendor/kit/obsidian-mock";

// `moment` fehlt im Kit-Mock. Das echte Paket (kommt mit `obsidian` ins node_modules) formatiert
// wie Obsidian — ein Double würde das Format der Daily-Notes-Einstellung nur nachbilden.
export { default as moment } from "moment";

// Fehlt im Kit-Mock: die Basisklasse eines Codeblock-Kindes (nur, was `HealthBlock` braucht).
export class MarkdownRenderChild {
  constructor(public containerEl: any) {}
  onload(): void {}
  onunload(): void {}
}
