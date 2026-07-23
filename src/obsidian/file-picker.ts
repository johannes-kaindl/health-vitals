/**
 * Öffnet den nativen Datei-Dialog und liefert die gewählte Datei.
 *
 * Bewusst über <input type="file"> statt Electrons dialog-API: das ist der
 * plattformneutrale Weg und kommt ohne node:-Module aus. Der absolute Pfad
 * (File.path) wird NICHT gelesen — die Datei wird ausschließlich über
 * file.stream() verarbeitet, damit das Plugin ohne Dateisystem-Zugriff auskommt.
 */
export function pickHealthExport(doc: Document): Promise<File | null> {
  return new Promise((resolve) => {
    // Obsidian-`createEl` statt rohem document.createElement (Store-Konformität):
    // erzeugt das Element und hängt es in einem Schritt an doc.body.
    const input = doc.body.createEl("input", {
      cls: "ah-file-picker-input",
      attr: { type: "file", accept: ".zip,.xml" },
    });

    const cleanup = (): void => { input.remove(); };

    input.addEventListener("change", () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    }, { once: true });

    // Wird gefeuert, wenn der Nutzer den Dialog ohne Auswahl schließt. Nicht in allen
    // Electron-Versionen zuverlässig — deshalb räumt auch "change" auf, und ein
    // hängengebliebenes Input schadet nicht (display:none, kein Listener mehr).
    input.addEventListener("cancel", () => {
      cleanup();
      resolve(null);
    }, { once: true });

    input.click();
  });
}
