/**
 * Aufnahme-Treiber für die README-Bilder — fährt den Vertrag aus `docs/images/README.md`
 * gegen ein **laufendes** Obsidian, statt die Bilder von Hand zu klicken.
 *
 * Brücke, Aufnahme-Primitive und Fixture→Vault liegen zentral im Dach
 * (`obsidian-plugins/tools/obsidian-cdp/`); hier steht **nur das Rezept** — welches Bild
 * was zeigt. Dieselbe Brücke benutzt `scripts/gui-smoke.ts`.
 *
 * ## Ablauf
 *
 * ⚠️ **Vor dem Quit koordinieren — Obsidian ist geteilte Infrastruktur.** Dieses Rezept
 * braucht den frischen Start (ein Bild pro Start, jeder Lauf hinterlässt Zustand); Mitnutzen ist
 * hier keine Alternative. Aber Obsidian ist Single-Instance: der Quit trifft die Instanz, an der
 * möglicherweise eine andere Session arbeitet, und zerstört deren Zustand. Der eigene Lauf ist
 * danach sauber grün; der Schaden fällt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "belegt — erst fragen, wem"
 * ```
 *
 * Hört der Port, hängt jemand dran: **erst fragen, dann quitten.** ⚠️ Und die Prüfung ersetzt die
 * Frage nicht — sie zeigt aktive CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den
 * Port wartet; am 2026-08-30 hätte sie einen zwei Stunden alten Reindex nicht gezeigt, denn der
 * hing an Ollama, nicht am Port.
 *
 * ```bash
 * export STAGING_VAULTS_DIR="$HOME/StagingVaults"   # einmalig
 * npm run build && npm run shots -- --setup         # Vault + synthetischer Cache
 *
 * osascript -e 'quit app "Obsidian"'                # Handarbeit: Debug-Port
 * open -a Obsidian --args --remote-debugging-port=9222
 * #   ... Vault "apple-health" öffnen und einmalig als vertrauenswürdig bestätigen
 *
 * npm run shots                                     # alles aufnehmen
 * npm run shots -- --only sleep-stages.png          # eines nachziehen
 * npm run shots -- --list                           # Vertrag als Liste
 * ```
 *
 * ## Was dieses Plugin besonders macht
 *
 * 1. **Die Daten kommen nicht aus dem Vault, sondern aus `health-cache.json`** im
 *    Plugin-Verzeichnis. Das Fixture erzeugt ihn synthetisch (`make-health-cache.mjs`) —
 *    ein echter Cache trägt personenbezogene Gesundheitsdaten und darf in kein Bild.
 * 2. **Alle Zeiträume sind relativ zum letzten Datenpunkt**, nicht zu „heute"
 *    (`resolveRange`). Deshalb altert das Fixture nicht und „1M" zeigt immer etwas.
 * 3. **Das Dashboard ist eine View, keine Notiz.** Es gibt nichts zu öffnen — der Zustand
 *    entsteht über den Befehl, danach über Klicks im DOM (Tabs, Zeitraum-Schaltflächen).
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { argv, cwd, env, exit } from "node:process";

import {
  Cdp,
  attachTo,
  closeExtraLeaves,
  pollUntil,
  setAppConfig,
} from "../../tools/obsidian-cdp/cdp.js";
import {
  boxAround,
  boxOf,
  capture,
  setWindowSize,
  withMetrics,
  writeShot,
  type Rect,
} from "../../tools/obsidian-cdp/shot.js";
import { buildVault, stagingVaultDir } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "health-vitals";
const REPO_NAME = "apple-health";
const VIEW_TYPE = "apple-health-dashboard";
const OUT_DIR = "docs/images";
const CAPTURE_WIDTH = 1200;
const THUMB_WIDTH = 380;
const PADDING = 12;
/**
 * Aufnahme-Dichte (`clip.scale`). 2 = dieselbe Fläche mit doppelter Pixelzahl — genau die
 * Dichte, die der Bild-Standard mit `capture_dpr` annimmt. Ohne sie ist ein Ausschnitt,
 * der schmaler als `capture_width` ist, laut Lint nur halb so breit einbettbar, und auf
 * einem Retina-Display sieht er weich aus.
 */
const DICHTE = 2;
// 1200 = `capture_width` des Bild-Standards. Damit ist ein vollbreiter Ausschnitt exakt
// die Aufnahmebreite und wird weder herunterskaliert noch bei der Einbettung künstlich
// begrenzt (`image-scale`). Breiter aufgenommen sähe der Hero außerdem leerer aus: Das
// Kachelraster hat feste Spaltenbreiten und füllt zusätzliche Breite nicht auf.
const FENSTER_BREITE = 1200;
const FENSTER_HOEHE = 900;

/** `METRIC_SLEEP_ASLEEP` aus src/core/sleep-session.ts. */
const METRIK_SCHLAF = "SleepAsleep";
const METRIK_RUHEPULS = "HKQuantityTypeIdentifierRestingHeartRate";

/** Index in `RANGES` aus src/obsidian/tabs/detail.ts: 0=1M, 1=3M, 2=1Y, 3=All. */
const ZEITRAUM = { einMonat: 0, dreiMonate: 1, einJahr: 2, alles: 3 } as const;

// --- Bausteine ---------------------------------------------------------------

/** Das gerade sichtbare Panel. `:not(.is-hidden)` statt Index — die Reihenfolge der Tabs
 *  ist eine Annahme, die Sichtbarkeit ist die Sache selbst. */
const PANEL = `document.querySelector(".ah-dashboard .ah-panel:not(.is-hidden)")`;

/** Dashboard öffnen und auf gerenderte Tabs warten. */
async function dashboard(cdp: Cdp): Promise<boolean> {
  await cdp.send("Page.bringToFront");
  await cdp.evaluate(`
    await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-dashboard`)});
    await new Promise((r) => setTimeout(r, 800));
    return true;
  `);
  // Erst öffnen, dann aufräumen: so ist das aktive Blatt garantiert das Dashboard, und
  // das Abräumen muss nicht raten, welches bleiben darf.
  await closeExtraLeaves(cdp);
  const da = await pollUntil<boolean>(
    cdp,
    `return Boolean(document.querySelector(".ah-dashboard .ah-tabbar"));`,
    15_000,
    300,
  );
  if (!da) {
    // Diagnose statt „Zustand kam nicht zustande": Die drei häufigsten Ursachen sind von
    // außen ununterscheidbar — Plugin aus (Vertrauen nicht bestätigt), Cache fehlt
    // (Import-Screen statt Tabs), falscher Vault.
    const lage = await cdp.evaluate<string>(`
      return JSON.stringify({
        vault: app.vault.getName(),
        pluginAn: !!app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}],
        views: app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)}).length,
        importScreen: !!document.querySelector(".ah-import-host"),
      });
    `);
    console.log(`      · Dashboard nicht bereit: ${lage}`);
    return false;
  }
  return true;
}

/** Auf einen Tab schalten. `index` folgt `TABS` aus src/obsidian/dashboard-view.ts:
 *  0=Overview, 1=Detail, 2=Workouts. */
async function tab(cdp: Cdp, index: number): Promise<void> {
  await cdp.evaluate(`
    document.querySelectorAll(".ah-dashboard .ah-tabbar .ah-tab")[${index}]?.click();
    await new Promise((r) => setTimeout(r, 500));
    return true;
  `);
}

/** Detail-Ansicht auf eine Metrik stellen. Über die View-API, weil die Kachel dafür in
 *  einer womöglich zugeklappten Kategorie steckt — der Zustand wird hergestellt, gemessen
 *  wird danach am DOM. */
async function metrik(cdp: Cdp, id: string): Promise<void> {
  await cdp.evaluate(`
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    leaf?.view?.openDetail(${JSON.stringify(id)});
    await new Promise((r) => setTimeout(r, 700));
    return true;
  `);
}

/** Zeitraum über die Schaltfläche wählen — der echte Weg des Nutzers. Die **erste**
 *  `.ah-range-bar` im Panel ist die Zeitraum-Leiste; eine zweite gleicher Klasse steht in
 *  der Export-Zeile (MD/CSV). */
async function zeitraum(cdp: Cdp, index: number): Promise<void> {
  await cdp.evaluate(`
    const bar = ${PANEL}?.querySelector(".ah-range-bar");
    bar?.querySelectorAll(".ah-range-btn")[${index}]?.click();
    await new Promise((r) => setTimeout(r, 800));
    return true;
  `);
}

/** Favoriten setzen — für den Hero. Über den Host statt über Sternklicks: die Kacheln
 *  liegen in zugeklappten Kategorien, und ein Klick auf einen nicht gerenderten Stern
 *  wäre ein stiller Fehlgriff. */
async function favoriten(cdp: Cdp, ids: string[]): Promise<void> {
  await cdp.evaluate(`
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    const soll = ${JSON.stringify(ids)};
    for (const id of soll) {
      if (!plugin.getFavorites().includes(id)) await plugin.toggleFavorite(id);
    }
    for (const id of [...plugin.getFavorites()]) {
      if (!soll.includes(id)) await plugin.toggleFavorite(id);
    }
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    leaf?.view?.refreshOverview?.();
    await new Promise((r) => setTimeout(r, 500));
    return true;
  `);
}

/**
 * Kategorien im Übersicht-Tab auf einen definierten Aufklappzustand bringen.
 *
 * Der Zustand ist **persistent** (`data.json`, Schlüssel `overview-cat:<key>`) und
 * überlebt damit jeden früheren Lauf. Ohne dieses Herstellen zeigte der Hero, was beim
 * letzten Mal offen stehen geblieben ist — ein Bild, das den Zustand des Aufnehmenden
 * dokumentiert statt den Auslieferungszustand.
 */
async function kategorien(cdp: Cdp, offen: string[]): Promise<void> {
  await cdp.evaluate(`
    const plugin = app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}];
    const offen = ${JSON.stringify(offen)};
    for (const key of ["activity", "heart", "body", "sleep", "nutrition", "other"]) {
      plugin.setCollapsed("overview-cat:" + key, !offen.includes(key));
    }
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    leaf?.view?.refreshOverview?.();
    await new Promise((r) => setTimeout(r, 500));
    return true;
  `);
}

/**
 * Ausschnitt vom oberen Rand eines Elements bis zum unteren Rand eines anderen.
 *
 * `boxOf` liefert ein Element; die interessanten Motive hier bestehen aber aus mehreren
 * Geschwistern (Kopfzeile + Chart + Kennzahlen). Ein Ausschnitt über das ganze Panel wäre
 * die Alternative — er nähme aber allen Leerraum darunter mit, und genau daraus entsteht
 * der tote Weißraum, den der Bild-Standard zu Recht bemängelt.
 */
async function boxVonBis(
  cdp: Cdp,
  vonSel: string,
  bisSel: string,
  padding = PADDING,
  // Unten knapper als oben: Im Detail-Tab folgt auf jede Sektion sofort die nächste, und
  // zwölf Pixel Rand holen deren Überschrift als angeschnittenen Streifen ins Bild.
  padUnten = 4,
): Promise<Rect | null> {
  return cdp.evaluate<Rect | null>(`
    const sichtbar = (sel) => [...document.querySelectorAll(sel)]
      .filter((e) => e.getBoundingClientRect().width > 1)[0] ?? null;
    const von = sichtbar(${JSON.stringify(vonSel)});
    const bis = sichtbar(${JSON.stringify(bisSel)});
    if (!von || !bis) return null;
    const a = von.getBoundingClientRect();
    const b = bis.getBoundingClientRect();
    const p = ${padding};
    return {
      x: Math.max(0, Math.round(a.left - p)),
      y: Math.max(0, Math.round(a.top - p)),
      width: Math.round(Math.max(a.width, b.width) + 2 * p),
      // Das LETZTE Element entscheidet über die Höhe, nicht der Container: in einem
      // Panel, das den Rest der Fensterhöhe füllt, ist die Container-Unterkante nur
      // Leere — und die landet als grauer Streifen im Bild.
      height: Math.round(b.bottom - a.top + p + ${padUnten}),
    };
  `);
}

/**
 * Aufnehmen mit **simuliert hohem Fenster**.
 *
 * Der Grund ist die teuerste Falle dieses Rezepts: `Page.captureScreenshot` verlängert mit
 * `captureBeyondViewport` die *Seite*, nicht den scrollenden Container des Panels. Alles,
 * was unterhalb der Fensterkante liegt — und das ist im Detail-Tab so ziemlich alles außer
 * dem ersten Chart —, kommt als **weiße Fläche** ins Bild. Der Lauf meldet dabei Erfolg:
 * der Ausschnitt ist rechnerisch korrekt, er zeigt nur nichts. Im ersten Lauf am
 * 2026-08-18 waren drei von sieben Bildern auf diese Weise leer, zwischen 731 Byte und
 * 3 KB groß, und jede Prüfung außer dem Hinsehen hätte sie durchgelassen.
 *
 * Die Höhe wird **gemessen, nicht geraten** (`scrollHeight` des Panels): eine feste
 * Simulationshöhe schneidet bei langen Inhalten ab und füllt bei kurzen den Rest mit
 * Leere. Nach dem Umschalten der Metriken braucht das Layout einen Moment — deshalb wird
 * auf **Ruhe** gewartet (zwei gleiche Messungen), nicht auf eine Sekundenzahl.
 */
async function schussHoch(
  cdp: Cdp,
  messen: () => Promise<Rect | null>,
): Promise<Buffer | null> {
  const noetig = await cdp.evaluate<number>(`
    const panel = ${PANEL};
    if (!panel) return 0;
    const scroller = panel.closest(".view-content") ?? panel;
    return Math.ceil(Math.max(panel.scrollHeight, scroller.scrollHeight)) + 160;
  `);
  if (!noetig) return null;
  // Nach oben begrenzt: Ein simuliertes 6000-px-Fenster kostet Speicher und liefert am
  // Ende ein Bild, das ohnehin niemand als README-Bild einbetten würde.
  const hoehe = Math.min(2800, Math.max(FENSTER_HOEHE, noetig));
  return withMetrics(cdp, FENSTER_BREITE, hoehe, async () => {
    await ruhe(cdp);
    const box = await messen();
    if (!box) return null;
    return capture(cdp, box, DICHTE);
  });
}

/** Warten, bis das Layout steht — zwei gleiche Messungen hintereinander.
 *  Eine feste Wartezeit ist entweder zu kurz (Bild vom halben Zustand) oder Verschwendung;
 *  gemessene Ruhe ist beides nicht. */
async function ruhe(cdp: Cdp): Promise<void> {
  let letzte = -1;
  for (let i = 0; i < 20; i++) {
    const jetzt = await cdp.evaluate<number>(`
      const panel = ${PANEL};
      return panel ? Math.round(panel.getBoundingClientRect().height + panel.scrollHeight) : 0;
    `);
    if (jetzt > 0 && jetzt === letzte) return;
    letzte = jetzt;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Die Statusleiste gehört dem Wirt, nicht dem Produkt: Sie schwebt über der rechten
 *  unteren Ecke und klebt sonst als fremdes Symbol in jedem Bild. Per eingefügtem `<style>`
 *  ausgeblendet — kein Neuladen nötig, und `--setup` räumt es beim nächsten Mal ohnehin ab. */
async function statusleiste(cdp: Cdp, sichtbar: boolean): Promise<void> {
  await cdp.evaluate(`
    const id = "shots-hide-status";
    document.getElementById(id)?.remove();
    if (!${JSON.stringify(sichtbar)}) {
      const el = document.createElement("style");
      el.id = id;
      el.textContent = ".status-bar { display: none !important; }";
      document.head.appendChild(el);
    }
    await new Promise((r) => setTimeout(r, 200));
    return true;
  `);
}

// --- Rezept ------------------------------------------------------------------

interface Shot {
  name: string;
  klasse: "hero" | "feature" | "detail";
  /** Nimmt selbst auf: Nur so kann ein Shot entscheiden, ob er ein hohes Fenster braucht
   *  (siehe `schussHoch`) oder das ganze Fenster zeigt. Ein Rückgabewert `null` heißt
   *  „Zustand kam nicht zustande" — und niemals „nimm halt irgendwas auf". */
  run(cdp: Cdp): Promise<Buffer | null>;
}

const SHOTS: Shot[] = [
  {
    name: "overview.png",
    klasse: "hero",
    async run(cdp) {
      if (!(await dashboard(cdp))) return null;
      await favoriten(cdp, [
        "HKQuantityTypeIdentifierStepCount",
        METRIK_RUHEPULS,
        METRIK_SCHLAF,
      ]);
      await kategorien(cdp, ["activity"]);
      await tab(cdp, 0);
      await ruhe(cdp);
      // Das ganze Fenster in voller Breite, aber nur bis zum letzten Inhalt: Die
      // Einbettung in Obsidian (Titelleiste, Tabs, Ribbon) gehört zum Hero — sie sagt dem
      // Leser, wo er das findet. Der leere Rest des Fensters darunter gehört nicht dazu;
      // ein Bild, das zu einem Drittel aus Weißraum besteht, besteht jede Prüfung und
      // wirkt trotzdem wie ein Fehler.
      const box = await cdp.evaluate<Rect | null>(`
        const panel = ${PANEL};
        const letzte = [...(panel?.querySelectorAll(".ah-cat") ?? [])].pop()
          ?? panel?.querySelector(".ah-tile-grid");
        if (!letzte) return null;
        return {
          x: 0,
          y: 0,
          width: Math.round(window.innerWidth),
          height: Math.min(
            Math.round(window.innerHeight),
            Math.round(letzte.getBoundingClientRect().bottom + 24),
          ),
        };
      `);
      if (!box) return null;
      return capture(cdp, box, DICHTE);
    },
  },
  {
    name: "detail-chart.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await dashboard(cdp))) return null;
      await metrik(cdp, METRIK_RUHEPULS);
      await zeitraum(cdp, ZEITRAUM.dreiMonate);
      const da = await pollUntil<boolean>(
        cdp,
        `return Boolean(${PANEL}?.querySelector(".ah-detail-chart .ah-chart-line"));`,
        10_000,
        250,
      );
      if (!da) return null;
      return schussHoch(cdp, () =>
        boxVonBis(cdp, ".ah-detail-head", ".ah-panel:not(.is-hidden) > .ah-stat-row"));
    },
  },
  {
    name: "sleep-stages.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await dashboard(cdp))) return null;
      await metrik(cdp, METRIK_SCHLAF);
      await zeitraum(cdp, ZEITRAUM.dreiMonate);
      // Auf die Segmente warten, nicht auf die Sektion: Die Überschrift steht schon da,
      // während der Stapel noch entsteht — ein Bild davon zeigt eine leere Fläche.
      const da = await pollUntil<boolean>(
        cdp,
        `return document.querySelectorAll(".ah-stages .ah-chart-stack").length > 20;`,
        10_000,
        250,
      );
      if (!da) return null;
      return schussHoch(cdp, () =>
        boxVonBis(cdp, ".ah-stages", ".ah-stages .ah-stat-row"));
    },
  },
  {
    name: "sleep-stages-unspecified.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await dashboard(cdp))) return null;
      await metrik(cdp, METRIK_SCHLAF);
      await zeitraum(cdp, ZEITRAUM.alles);
      // Hier ist die Hinweiszeile der Gegenstand des Bildes — ohne sie hat das Motiv keine
      // Aussage. Sie ist zugleich der Beleg, dass die Zeile den Daten folgt: im 3M-Bild
      // daneben steht sie nicht.
      const da = await pollUntil<boolean>(
        cdp,
        `return Boolean(${PANEL}?.querySelector(".ah-stage-note"))
          && document.querySelectorAll(".ah-stages .ah-chart-stack").length > 10;`,
        10_000,
        250,
      );
      if (!da) {
        console.log("      · Hinweiszeile fehlt — Fixture ohne Übergewicht unbestimmter Nächte?");
        return null;
      }
      return schussHoch(cdp, () =>
        boxVonBis(cdp, ".ah-stages", ".ah-panel:not(.is-hidden) .ah-stage-note"));
    },
  },
  {
    name: "values-export.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await dashboard(cdp))) return null;
      await metrik(cdp, METRIK_RUHEPULS);
      await zeitraum(cdp, ZEITRAUM.einMonat);
      // Aufklappen nur, wenn zu — ein blinder Klick schlösse eine offene Sektion, und der
      // Zustand ist persistent (data.json), überlebt also frühere Läufe.
      await cdp.evaluate(`
        const panel = ${PANEL};
        const wrap = panel?.querySelector(".ah-table-wrap");
        if (!wrap || wrap.getBoundingClientRect().height === 0) {
          panel?.querySelector(".okit-collapsible-header")?.click();
          await new Promise((r) => setTimeout(r, 600));
        }
        return true;
      `);
      const da = await pollUntil<boolean>(
        cdp,
        `return (${PANEL}?.querySelectorAll(".ah-table tbody tr").length ?? 0) > 5;`,
        10_000,
        250,
      );
      if (!da) return null;
      // Nur die ersten Tabellenzeilen: Die Tabelle ist so lang wie der Zeitraum, und ein
      // Bild von dreißig Zeilen sprengt jedes Seitenverhältnis. Die Kante gehört ins
      // Rezept, nicht in einen Nachschnitt — sonst ist das Rezept nicht mehr die einzige
      // Quelle des Bildes.
      return schussHoch(cdp, () => cdp.evaluate<Rect | null>(`
        const panel = ${PANEL};
        const kopf = panel?.querySelector(".okit-collapsible-header");
        const zeilen = [...(panel?.querySelectorAll(".ah-table tbody tr") ?? [])];
        if (!kopf || zeilen.length === 0) return null;
        const a = kopf.getBoundingClientRect();
        // Oben knapp UNTER der Kennzahlen-Zeile ansetzen: Ein pauschales Padding schnitt
        // dort eine halbe Zeile mit, die zum Motiv nicht gehört.
        const darueber = panel?.querySelector(":scope > .ah-stat-row");
        const oben = darueber
          ? Math.max(darueber.getBoundingClientRect().bottom + 6, a.top - ${PADDING})
          : a.top - ${PADDING};
        const index = Math.min(7, zeilen.length - 1);
        // Bis knapp VOR die nächste Zeile schneiden, nicht bis hinter die letzte: sonst
        // steht im Bild eine halbe achte Zeile, und die sieht aus wie ein Fehler.
        // Die Variable unten IST die Schnittkante — kein Padding mehr dahinter. Genau
        // daran hing im dritten Lauf die halbe neunte Zeile am unteren Rand: die Kante lag
        // richtig, und die zwoelf Pixel Rand holten die naechste Zeile wieder herein.
        const naechste = zeilen[index + 1];
        const unten = naechste
          ? naechste.getBoundingClientRect().top - 1
          : zeilen[index].getBoundingClientRect().bottom + ${PADDING};
        const p = ${PADDING};
        return {
          x: Math.max(0, Math.round(a.left - p)),
          y: Math.max(0, Math.round(oben)),
          width: Math.round(a.width + 2 * p),
          height: Math.round(unten - oben),
        };
      `));
    },
  },
  {
    name: "workouts.png",
    klasse: "feature",
    async run(cdp) {
      if (!(await dashboard(cdp))) return null;
      await tab(cdp, 2);
      const da = await pollUntil<boolean>(
        cdp,
        `return (${PANEL}?.querySelectorAll(".ah-workout-row").length ?? 0) > 3;`,
        10_000,
        250,
      );
      if (!da) return null;
      return schussHoch(cdp, () => cdp.evaluate<Rect | null>(`
        const panel = ${PANEL};
        const zeilen = [...(panel?.querySelectorAll(".ah-workout-row") ?? [])];
        if (!panel || zeilen.length === 0) return null;
        const a = panel.getBoundingClientRect();
        // Sechs Einheiten erklären die Liste; alle vierzig ergäben ein Bild, das nur noch
        // Zeilen ist. Schnitt knapp vor der siebten, damit keine halbe Zeile stehen bleibt.
        const index = Math.min(5, zeilen.length - 1);
        const naechste = zeilen[index + 1];
        const unten = naechste
          ? naechste.getBoundingClientRect().top - 1
          : zeilen[index].getBoundingClientRect().bottom + ${PADDING};
        const p = ${PADDING};
        return {
          x: Math.max(0, Math.round(a.left - p)),
          y: Math.max(0, Math.round(a.top - p)),
          width: Math.round(a.width + 2 * p),
          // Kein Padding hinter der Schnittkante: sonst steht dort eine halbe Zeile.
          height: Math.round(unten - a.top + p),
        };
      `));
    },
  },
  {
    name: "import.png",
    klasse: "feature",
    async run(cdp) {
      // Der einzige Zustand, der sich nicht durch Klicken herstellen lässt: Das Dashboard
      // zeigt den Import-Screen nur ohne Cache. Der Cache wird deshalb umbenannt, das
      // Plugin neu geladen — und im `finally` von main() beides zurückgenommen.
      if (!(await cacheBeiseite(cdp, true))) return null;
      if (!(await pollUntil<boolean>(
        cdp,
        `return Boolean(document.querySelector(".ah-import-host"));`,
        10_000,
        250,
      ))) return null;
      await ruhe(cdp);
      // Um den INHALT, nicht um seinen Kasten: Beide Container (`.ah-import-host` und
      // `.ah-import`) sind so breit wie das Blatt, der Text steht zentriert darin. Ein
      // Ausschnitt auf den Kasten bestand zu einem Drittel aus Leere und fing links
      // Ribbon-Symbole mit ein; die drei Textelemente umschlossen ergeben genau das
      // Motiv. Großzügiges Padding, damit es nicht beschnitten wirkt.
      const box = await boxAround(
        cdp,
        [".ah-import h3", ".ah-import p", ".ah-import button"],
        36,
      );
      if (!box) return null;
      return capture(cdp, box, DICHTE);
    },
  },
];

/**
 * Den Cache beiseitelegen oder zurückholen und das Plugin neu laden.
 *
 * Verschieben statt löschen: Der Cache ist im Aufnahme-Vault zwar synthetisch und in
 * Sekunden neu erzeugt — aber ein Treiber, der Dateien löscht, ist einen Tippfehler von
 * einem echten Vault entfernt. Rückgabe sagt, ob der Zustand hergestellt wurde.
 */
async function cacheBeiseite(cdp: Cdp, beiseite: boolean): Promise<boolean> {
  return Boolean(await cdp.evaluate<boolean>(`
    const id = ${JSON.stringify(PLUGIN_ID)};
    const dir = app.plugins.plugins[id]?.manifest?.dir
      ?? app.plugins.manifests[id]?.dir;
    if (!dir) return false;
    const cache = dir + "/health-cache.json";
    const ablage = dir + "/health-cache.shots-backup.json";
    const von = ${JSON.stringify(beiseite)} ? cache : ablage;
    const nach = ${JSON.stringify(beiseite)} ? ablage : cache;
    if (await app.vault.adapter.exists(von)) {
      if (await app.vault.adapter.exists(nach)) await app.vault.adapter.remove(nach);
      await app.vault.adapter.rename(von, nach);
    } else if (!(await app.vault.adapter.exists(nach))) {
      return false;
    }
    app.workspace.detachLeavesOfType(${JSON.stringify(VIEW_TYPE)});
    await app.plugins.disablePlugin(id);
    await new Promise((r) => setTimeout(r, 400));
    await app.plugins.enablePlugin(id);
    await new Promise((r) => setTimeout(r, 900));
    await app.commands.executeCommandById(id + ":open-dashboard");
    await new Promise((r) => setTimeout(r, 900));
    return true;
  `));
}

// --- Lauf --------------------------------------------------------------------

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
}

async function main(): Promise<void> {
  // cwd, nicht import.meta.url: Der Treiber wird vor dem Lauf nach `.shots.mjs` ins
  // Repo-Root gebündelt — ein Pfad relativ zur Modul-URL zeigte dann daneben.
  const repoRoot = cwd();
  const outDir = join(repoRoot, OUT_DIR);

  if (argv.includes("--list")) {
    for (const s of SHOTS) console.log(`  ${s.klasse.padEnd(8)} ${s.name}`);
    return;
  }

  if (argv.includes("--setup")) {
    const vaultDir = stagingVaultDir(REPO_NAME);
    console.log(`Aufnahme-Vault: ${vaultDir}`);
    for (const zeile of buildVault({
      repoRoot,
      vaultDir,
      fixtureDir: join(repoRoot, "docs/images/fixture"),
      generator: "make-health-cache.mjs",
      pluginId: PLUGIN_ID,
    })) {
      console.log(`  ${zeile}`);
    }
    console.log(
      "\n⚠️  Lief Obsidian während dieses Setups, muss es JETZT neu starten. --setup hat\n"
      + "   Notizen, Layout und Plugin-Einstellungen ersetzt; ein laufendes Obsidian hält\n"
      + "   den alten Stand im Speicher und schreibt ihn zurück.\n"
      + "\n⚠️  Erst prüfen, ob schon ein Obsidian läuft — ein Quit zerstört den Zustand\n"
      + "    einer fremden Session, und der eigene Lauf ist danach trotzdem grün:\n"
      + "      lsof -nP -iTCP:9222 -sTCP:LISTEN\n"
      + "    Hört der Port, hängt jemand dran: erst fragen, dann quitten.\n"
      + "\nObsidian mit offenem Debug-Port starten und diesen Vault öffnen:\n"
      + "  osascript -e 'quit app \"Obsidian\"'\n"
      + "  open -a Obsidian --args --remote-debugging-port=9222\n"
      + "Beim ersten Mal fragt Obsidian, ob es dem Vault-Autor vertraut — bestätigen,\n"
      + "sonst läuft das Plugin nicht und das Dashboard bleibt leer.",
    );
    return;
  }

  const port = Number(flag("--port") ?? env.SHOTS_PORT ?? 9222);
  const nur = flag("--only");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const cdp = await attachTo("workspace", port, REPO_NAME);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit dem Vault "${REPO_NAME}" auf Port ${port}.\n`
      + "Den Aufnahme-Vault öffnen (er darf neben anderen Vaults offen sein):\n"
      + `  open -a Obsidian "$STAGING_VAULTS_DIR/${REPO_NAME}"`,
    );
  }
  console.log(`Verbunden auf Port ${port}.\n`);
  await cdp.mitschnitt((zeile) => console.log(`      » ${zeile}`));

  let cacheVersteckt = false;
  try {
    // Aufnahmesprache PRÜFEN, nicht setzen: Sie ist app-weit, ein Umstellen wirkt erst
    // nach einem Neustart, und wer sie hier stillschweigend änderte, hinterließe den
    // Arbeits-Vault des Maintainers in der Aufnahmesprache. Also Abbruch mit Klartext
    // statt englischer Vertrag und deutsche Bilder — das fiele erst beim Ansehen auf,
    // und dann sind alle sieben falsch.
    //
    // Gefragt wird `documentElement.lang`, NICHT `localStorage["language"]`: Der
    // Speicherwert ist die Einstellung für den **nächsten** Start, nicht die geladene
    // Sprache. Beide weichen genau dann ab, wenn man nach der Aufnahme zurückstellt und
    // ohne Neustart weiterarbeitet — gemessen am 2026-08-18: `localStorage` sagte "de",
    // die Oberfläche stand auf Englisch und die Prüfpunkte hätten grundlos abgebrochen.
    const sprache = await cdp.evaluate<{ geladen: string; gespeichert: string | null }>(`
      return {
        geladen: document.documentElement.lang || "",
        gespeichert: window.localStorage.getItem("language"),
      };
    `);
    if (sprache.geladen && !sprache.geladen.startsWith("en")) {
      throw new Error(
        `Obsidians Oberfläche läuft auf "${sprache.geladen}", der Bildvertrag verlangt Englisch.\n`
        + `  (gespeichert für den nächsten Start: ${sprache.gespeichert ?? "—"})\n`
        + "  Umstellen (app-weit, wirkt nach einem Neustart):\n"
        + "    Einstellungen → Über → Sprache → English\n"
        + "  Nach der Aufnahme zurückstellen — sonst startet auch der Arbeits-Vault englisch.",
      );
    }

    // Feste Fenstergröße — sonst hängt jedes Bild an dem Display, auf dem es entstand.
    await setWindowSize(cdp, FENSTER_BREITE, FENSTER_HOEHE);
    // Zur Laufzeit, nicht über die Fixture-Datei: Ein laufendes Obsidian liest sie nicht
    // neu und schreibt seinen Speicherstand zurück.
    await setAppConfig(cdp, "readableLineLength", false);
    await setAppConfig(cdp, "showInlineTitle", false);
    // Die Statusleiste gehört dem Wirt: Sie schwebt über der rechten unteren Ecke und
    // klebte im ersten Lauf als fremdes Symbol in vier von sieben Bildern.
    await statusleiste(cdp, false);
    // Beide Sidebars zu: Sie tragen zum Motiv nichts bei und drücken das Dashboard in
    // eine Spalte, in der die Charts unlesbar werden.
    await cdp.evaluate(`
      app.workspace.leftSplit?.collapse();
      app.workspace.rightSplit?.collapse();
      await new Promise((r) => setTimeout(r, 400));
      return true;
    `);

    let ok = 0;
    let fehlend = 0;
    for (const shot of SHOTS) {
      if (nur && shot.name !== nur) continue;
      try {
        const png = await shot.run(cdp);
        if (shot.name === "import.png") cacheVersteckt = true;
        if (!png) {
          console.log(`  ✗ ${shot.name} — Zustand kam nicht zustande`);
          fehlend++;
          continue;
        }
        console.log(`  ✓ ${await writeShot(cdp, shot.name, png, {
          outDir,
          captureWidth: CAPTURE_WIDTH,
          thumbWidth: THUMB_WIDTH,
          thumb: shot.klasse === "detail",
        })}`);
        ok++;
      } catch (err) {
        console.log(`  ✗ ${shot.name} — ${(err as Error).message}`);
        fehlend++;
      }
    }

    console.log(`\n${ok} Bild(er) geschrieben, ${fehlend} offen.`);
    if (fehlend) process.exitCode = 1;
  } finally {
    await statusleiste(cdp, true).catch(() => undefined);
    // Der Cache muss zurück, auch wenn der Lauf mittendrin abbricht — sonst steht der
    // Aufnahme-Vault beim nächsten Mal auf dem Import-Screen und jedes Bild scheitert an
    // einer Ursache, die drei Schritte vorher entstanden ist.
    if (cacheVersteckt) {
      const zurueck = await cacheBeiseite(cdp, false).catch(() => false);
      console.log(zurueck ? "Cache zurückgelegt." : "⚠️  Cache NICHT zurückgelegt — `--setup` wiederholen.");
    }
    cdp.close();
  }
}

main().catch((err: Error) => {
  console.error(err.message);
  exit(1);
});
