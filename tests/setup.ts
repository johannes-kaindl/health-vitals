import { beforeEach } from "vitest";
import { registerI18n, setLang } from "../src/i18n/strings";

// `environment: "node"` (vitest.config.ts) — es gibt hier also kein `window`. In Obsidian
// gibt es eines, und `obsidianmd/prefer-window-timers` verlangt ausdrücklich, Timer darüber
// zu setzen: In einem Popout-Fenster zeigt das globale `setTimeout` auf das falsche Fenster.
// Damit ist jeder Plugin-Pfad mit einem Timer in Node nicht lauffähig, solange niemand
// `window` bereitstellt.
//
// Das hat zweimal in Folge ein Release gekippt (0.4.0, 0.4.1), und zwar nicht als
// Testfehler, sondern als unbehandelte Promise-Ablehnung: Der Timer in `flashCopied` läuft
// aus einem `.then()`, also nachdem der klickende Test längst durch ist. Ob so ein Fehler
// den Lauf noch rot macht, entscheidet ein Rennen gegen das Prozessende — lokal gewann das
// Prozessende, im CI der Fehler. Ein Stub pro betroffener Testdatei behebt jeweils nur den
// nächsten Fundort; deshalb steht der Shim hier, einmal für alle.
//
// Die Delegation ist absichtlich indirekt (Aufruf statt Referenz): So greift sie auf die
// jeweils aktuelle globale Funktion und damit auch auf die von `vi.useFakeTimers()`
// eingesetzte Variante. Bewusst nur die Timer und kein DOM — `happy-dom` würde hier ein
// vollständiges `document` neben die handgeschriebenen Element-Mocks der Tests stellen.
if (!("window" in globalThis)) {
  (globalThis as Record<string, unknown>).window = {
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id?: number) => { clearTimeout(id); },
    setInterval: (fn: () => void, ms?: number) => setInterval(fn, ms),
    clearInterval: (id?: number) => { clearInterval(id); },
  };
}

beforeEach(() => {
  registerI18n();
  setLang("de");
});
