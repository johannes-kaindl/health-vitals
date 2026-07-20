import { ButtonComponent } from "obsidian";
import type { ImportPhase, ImportState } from "../../core/import-state";

export interface ImportActions {
  choose(): void;
  abort(): void;
}

const PHASE_LABEL: Record<ImportPhase, string> = {
  unzipping: "Export wird entpackt …",
  parsing: "Daten werden gelesen …",
  writing: "Ergebnis wird gespeichert …",
};

/** Rendert den Import-Screen für den gegebenen Zustand. Ersetzt den Inhalt von `el`. */
export function renderImport(el: HTMLElement, state: ImportState, actions: ImportActions): void {
  el.empty();
  const box = el.createDiv({ cls: "ah-empty ah-import" });

  if (state.status === "running") {
    box.createEl("h3", { text: "Import läuft" });
    box.createEl("p", { cls: "ah-import-file", text: state.fileName });
    box.createEl("p", { cls: "ah-import-phase", text: PHASE_LABEL[state.phase] });
    box.createEl("p", {
      cls: "ah-import-count",
      text: state.records > 0 ? `${state.records.toLocaleString("de-DE")} Datensätze` : "…",
    });
    // Only show cancel button during unzipping/parsing; writing phase is point of no return
    if (state.phase === "unzipping" || state.phase === "parsing") {
      new ButtonComponent(box).setButtonText("Abbrechen").onClick(() => { actions.abort(); });
    }
    return;
  }

  if (state.status === "failed") {
    box.createEl("h3", { text: "Import fehlgeschlagen" });
    box.createEl("p", { cls: "ah-import-error", text: state.message });
    new ButtonComponent(box).setButtonText("Erneut versuchen").setCta()
      .onClick(() => { actions.choose(); });
    return;
  }

  if (state.status === "aborted") {
    box.createEl("h3", { text: "Import abgebrochen" });
    box.createEl("p", { text: "Es wurden keine Daten gespeichert." });
    new ButtonComponent(box).setButtonText("Export auswählen").setCta()
      .onClick(() => { actions.choose(); });
    return;
  }

  // idle / done-ohne-Cache
  box.createEl("h3", { text: "Noch keine Daten" });
  box.createEl("p", {
    text: "Exportiere deine Daten in der Health-App (Profil → Alle Gesundheitsdaten "
      + "exportieren) und wähle hier die entstandene Datei aus.",
  });
  new ButtonComponent(box).setButtonText("Export auswählen").setCta()
    .onClick(() => { actions.choose(); });
}
