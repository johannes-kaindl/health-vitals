// Zweigleisige Settings (Muster audio-interface/src/obsidian/settings-tab.ts): EINE Definition für
// den nativen 1.13-Host (Einstellungs-Suche) und den Fallback `display()` darunter.
import { PluginSettingTab, type App, type Plugin, type SettingDefinitionItem } from "obsidian";
import { githubHelpUrls, helpSettingDefinition, HELP_SETTING_TEXTS_DE, HELP_SETTING_TEXTS_EN } from "../vendor/kit-obsidian/help-setting";
import { renderSettingDefinitions } from "../vendor/kit-obsidian/settings_walker";
import { exportFormatLabel, getLang, t } from "../i18n/strings";
import type { DashboardHost } from "./dashboard-view";

/** Der Teil des Hosts, den die Einstellungen brauchen (Export-Ordner und -Format). */
export type SettingsHost = Pick<DashboardHost, "getExportFolder" | "setExportFolder" | "getExportFormat" | "setExportFormat">;

type Key = "exportFolder" | "exportFormat";

/** Wartezeit, bis ein getippter Ordnerpfad gespeichert wird. Jeder Setter schreibt data.json als
 *  Ganzes und unawaited (siehe tabs/detail.ts): je Tastenanschlag ein Schreibvorgang ließe
 *  nebenläufige Schreibvorgänge um die Reihenfolge laufen, und ein abgeschnittenes Präfix könnte
 *  gewinnen. */
const FOLDER_SAVE_DELAY_MS = 400;

export class HealthVitalsSettingTab extends PluginSettingTab {
  private cleanup: () => void = () => {};
  private pendingFolder: string | null = null;
  private folderTimer: number | null = null;

  constructor(app: App, plugin: Plugin, private readonly host: SettingsHost) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<Key>[] {
    return [
      // UI-STANDARD §8 „Hilfe-Zeile": immer das erste Element.
      helpSettingDefinition({
        ...githubHelpUrls("health-vitals"),
        texts: getLang() === "de" ? HELP_SETTING_TEXTS_DE : HELP_SETTING_TEXTS_EN,
      }),
      {
        name: t("settings.exportFolder.name"),
        desc: t("settings.exportFolder.desc"),
        control: { type: "folder", key: "exportFolder", placeholder: "/" },
      },
      {
        name: t("settings.exportFormat.name"),
        desc: t("settings.exportFormat.desc"),
        control: {
          type: "dropdown", key: "exportFormat",
          options: { md: exportFormatLabel("md"), csv: exportFormatLabel("csv") },
        },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return key === "exportFolder" ? this.host.getExportFolder() : this.host.getExportFormat();
  }

  setControlValue(key: string, value: unknown): void {
    if (key === "exportFormat") {
      this.host.setExportFormat(value === "csv" ? "csv" : "md");
      return;
    }
    if (key !== "exportFolder" || typeof value !== "string") return;
    this.pendingFolder = value;
    if (this.folderTimer !== null) window.clearTimeout(this.folderTimer);
    this.folderTimer = window.setTimeout(() => { this.flushFolder(); }, FOLDER_SAVE_DELAY_MS);
  }

  private flushFolder(): void {
    if (this.folderTimer !== null) { window.clearTimeout(this.folderTimer); this.folderTimer = null; }
    if (this.pendingFolder === null) return;
    const v = this.pendingFolder;
    this.pendingFolder = null;
    this.host.setExportFolder(v);
  }

  // ── Imperativer Fallback (Obsidian < 1.13) ───────────────────────────────
  display(): void {
    this.cleanup();
    this.containerEl.empty();
    this.cleanup = renderSettingDefinitions(this.containerEl, this.getSettingDefinitions(), this, this.app);
  }

  hide(): void {
    this.flushFolder();
    this.cleanup();
    this.cleanup = () => {};
  }
}
