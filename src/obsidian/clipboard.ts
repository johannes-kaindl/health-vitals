/**
 * Quittung am Knopf. `copyToClipboard` selbst steht seit Kit 0.27.0 in
 * `vendor/kit-obsidian/clipboard.ts` — hier bleibt nur `flashCopied`, das im Kit
 * (noch) nicht existiert: es ist dort als Kandidat bei n=2 gefuehrt, nicht als Modul.
 */

const FLASH_MS = 800;

/** Laufender Rückstell-Timer je Knopf. WeakMap, damit ein entsorgter Knopf nichts festhält. */
const flashTimers = new WeakMap<HTMLButtonElement, number>();

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
