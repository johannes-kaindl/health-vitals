import { beforeEach } from "vitest";
import { registerI18n, setLang } from "../src/i18n/strings";
import { installWindowTimers } from "./vendor/kit/window-timers";

// `environment: "node"` (vitest.config.ts) kennt kein `window`; `obsidianmd/prefer-window-timers`
// verlangt aber Timer über `window`. Der Shim kommt aus dem Kit (`installWindowTimers`, Herkunft
// dieser Datei). Die Begründung (zweimal in Folge ein gekipptes Release, 0.4.0 und 0.4.1: der Timer
// in `flashCopied` läuft aus einem `.then()` nach dem Test) steht im Kopf des Kit-Moduls und in
// REGISTRY.
installWindowTimers();

beforeEach(() => {
  registerI18n();
  setLang("de");
});
