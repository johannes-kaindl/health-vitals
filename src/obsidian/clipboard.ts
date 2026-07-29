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

const FLASH_MS = 800;

/**
 * Quittiert einen Kopiervorgang am Knopf selbst — Muster aus
 * `json_viewer/src/obsidian/CopyButton.ts`.
 *
 * Bewusst statt einer `Notice`: Die Rückmeldung erscheint dort, wo der Blick beim Klick
 * ohnehin ist, während eine Notice am Bildschirmrand aufgeht. `window.setTimeout`, nicht
 * `activeWindow.setTimeout` (`obsidianmd/prefer-window-timers`).
 *
 * Der Timer wird pro Knopf zurückgesetzt: Ohne das würde bei zwei Klicks kurz
 * hintereinander der Timer des ersten den Knopf zurückstellen, während die Quittung des
 * zweiten noch stehen sollte.
 */
export function flashCopied(btn: HTMLButtonElement, doneLabel: string, idleLabel: string): void {
  const pending = flashTimers.get(btn);
  if (pending !== undefined) window.clearTimeout(pending);
  btn.addClass("is-copied");
  btn.setText(doneLabel);
  flashTimers.set(btn, window.setTimeout(() => {
    flashTimers.delete(btn);
    btn.removeClass("is-copied");
    btn.setText(idleLabel);
  }, FLASH_MS));
}

const flashTimers = new WeakMap<HTMLButtonElement, number>();
