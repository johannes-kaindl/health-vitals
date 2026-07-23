import { ButtonComponent } from "obsidian";
import type { ImportPhase, ImportState } from "../../core/import-state";
import { t } from "../../vendor/kit/i18n";
import { localeTag } from "../../i18n/strings";

export interface ImportActions {
  choose(): void;
  abort(): void;
}

const PHASE_KEY: Record<ImportPhase, string> = {
  unzipping: "import.phase.unzipping",
  parsing: "import.phase.parsing",
  writing: "import.phase.writing",
};

/** Rendert den Import-Screen für den gegebenen Zustand. Ersetzt den Inhalt von `el`. */
export function renderImport(el: HTMLElement, state: ImportState, actions: ImportActions): void {
  el.empty();
  const box = el.createDiv({ cls: "ah-empty ah-import" });

  if (state.status === "running") {
    box.createEl("h3", { text: t("import.running.title") });
    box.createEl("p", { cls: "ah-import-file", text: state.fileName });
    box.createEl("p", { cls: "ah-import-phase", text: t(PHASE_KEY[state.phase]) });
    box.createEl("p", {
      cls: "ah-import-count",
      text: state.records > 0 ? t("import.records", state.records.toLocaleString(localeTag())) : "…",
    });
    if (state.phase === "unzipping" || state.phase === "parsing") {
      new ButtonComponent(box).setButtonText(t("import.cancel")).onClick(() => { actions.abort(); });
    }
    return;
  }

  if (state.status === "failed") {
    box.createEl("h3", { text: t("import.failed.title") });
    box.createEl("p", { cls: "ah-import-error", text: state.message });
    new ButtonComponent(box).setButtonText(t("import.retry")).setCta()
      .onClick(() => { actions.choose(); });
    return;
  }

  if (state.status === "aborted") {
    box.createEl("h3", { text: t("import.aborted.title") });
    box.createEl("p", { text: t("import.aborted.body") });
    new ButtonComponent(box).setButtonText(t("import.choose")).setCta()
      .onClick(() => { actions.choose(); });
    return;
  }

  // idle / done-ohne-Cache
  box.createEl("h3", { text: t("import.idle.title") });
  box.createEl("p", { text: t("import.idle.body") });
  new ButtonComponent(box).setButtonText(t("import.choose")).setCta()
    .onClick(() => { actions.choose(); });
}
