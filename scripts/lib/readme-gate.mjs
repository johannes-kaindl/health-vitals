// scripts/lib/readme-gate.mjs
// README-Drift-Gate (Sub-Spec B2, Layer 3): ruft den ZENTRALEN readme_lint.py gegen das
// Repo. errors stoppen das Release (die); Warnings werden nur gemeldet. Im Dry-Run wird
// nur berichtet (kein Abbruch). python3/Linter nicht auffindbar → Skip + Warnung (kein
// Hard-Fail: ein fremder Klon ohne _docs soll nicht release-blockiert sein).
import { execFileSync } from "node:child_process";

const DEFAULT_LINTER = "/Users/Shared/code/_docs/readme/readme_lint.py";

export function runReadmeGate({ repoDir = ".", dryRun = false, die, log, linter = DEFAULT_LINTER } = {}) {
  let exitCode = 0;
  let output = "";
  try {
    output = execFileSync("python3", [linter, repoDir], { encoding: "utf8" });
  } catch (err) {
    if (err && err.code === "ENOENT") {
      log("readme-gate: python3 nicht gefunden → README-Check übersprungen.");
      return;
    }
    if (err && typeof err.status === "number") {
      exitCode = err.status;
      output = (err.stdout || "").toString();
    } else {
      log(`readme-gate: Linter nicht ausführbar (${err && err.message}) → übersprungen.`);
      return;
    }
  }
  const report = output.trim();
  if (exitCode === 0) {
    log(report ? `readme-gate: README ok (nur Warnings/Info):\n${report}` : "readme-gate: README sauber.");
    return;
  }
  if (exitCode === 2) { // exit 2 = Linter nicht aufrufbar (Usage-Fehler ODER Skript fehlt, z.B. fremder Klon ohne _docs) → kein Drift, nur skip.
    log(`readme-gate: Linter-Usage-Fehler → übersprungen.\n${report}`);
    return;
  }
  if (dryRun) {
    log(`readme-gate [dry-run]: README-errors gefunden (Release würde stoppen):\n${report}`);
    return;
  }
  die(`README-errors — Release gestoppt. README fixen (readme_lint.py .) und erneut.\n${report}`);
}
