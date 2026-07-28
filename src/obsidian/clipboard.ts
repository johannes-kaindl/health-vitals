import { Notice } from "obsidian";
import { t } from "../vendor/kit/i18n";

/**
 * Text in die Zwischenablage schreiben. Übernommen aus
 * `json_viewer/src/obsidian/clipboard.ts`.
 *
 * Der `!clipboard`-Guard steht VOR jedem Zugriff und ist nicht defensiv-dekorativ:
 * In non-secure Contexts (ältere Android-WebViews) wirft bereits das Lesen von
 * `navigator.clipboard.writeText` synchron — ein try/catch um den Aufruf käme
 * dafür zu spät.
 */
export function copyToClipboard(text: string, onCopied?: () => void): void {
  const clipboard = navigator.clipboard;
  if (!clipboard) {
    new Notice(t("export.copyFailed"));
    return;
  }
  clipboard.writeText(text).then(
    () => onCopied?.(),
    () => { new Notice(t("export.copyFailed")); },
  );
}
