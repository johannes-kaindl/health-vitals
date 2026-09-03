/**
 * GUI-Smoke-Treiber — fährt die Checkliste aus `docs/SMOKE.md` gegen ein **laufendes**
 * Obsidian statt von Hand (CORE-TEST-02 b).
 *
 * ## Warum es diesen Treiber gibt
 *
 * Am 2026-08-18 meldete der Hand-Smoke „das Schlafphasen-Chart ist leer". Dahinter lagen
 * drei unabhängige Fehler übereinander, die **286 grüne Unit-Tests strukturell nicht sehen
 * konnten**:
 *
 *   1. Die einzige SVG-Maßregel hing am Container `.ah-detail-chart` statt an der
 *      Chart-Klasse — die Elemente waren da und korrekt berechnet, hatten aber **keine
 *      Fläche**.
 *   2. `createSvg` setzt Klassen über `classList.add` und **wirft** bei zwei Klassen in
 *      *einem* String (anders als `createEl`/`createDiv`) — der Render brach am ersten
 *      Segment ab; alles danach fehlte.
 *   3. `--background-modifier-border` als Füllfarbe kam auf **1,06:1** gegen den
 *      Hintergrund — bei „Alles" zwei Drittel der Fläche, unsichtbar.
 *
 * Ein DOM-Test sieht Elemente, ein CSS-Text-Test sieht Deklarationen. *Fläche*,
 * *Abbruch-nach-Render* und *Kontrast* entstehen erst aus deren Kombination, und die gibt
 * es nur im echten Rendering. Genau diese drei sind deshalb der Maßstab der Prüfpunkte
 * unten — jeder von ihnen hätte einen der Fehler gefunden.
 *
 * ## Was der Treiber NICHT protokolliert
 *
 * **Keine Gesundheitswerte.** Der Vault, gegen den das läuft, trägt echte Daten. Ins
 * Protokoll gehen ausschließlich Struktur- und Darstellungsgrößen (Anzahl Segmente,
 * Kontrastverhältnisse, Farben, Maße) — nie Messwerte, Datumsangaben oder Metriknamen aus
 * dem Cache. Wer hier einen Prüfpunkt ergänzt, hält sich daran: ein Smoke-Protokoll wird
 * kopiert, gepastet und landet in Session-Logs.
 *
 * ## Voraussetzung
 *
 * ⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
 * `quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
 * deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
 * fällt nicht auf.
 *
 * ```bash
 * lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
 * ```
 *
 * Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
 * `vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
 * wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
 * CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.
 *
 * Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.
 *
 * Obsidian muss mit offenem Debug-Port laufen (der eine Handgriff, der Handarbeit bleibt):
 *
 * ```bash
 * osascript -e 'quit app "Obsidian"'
 * open -a Obsidian --args --remote-debugging-port=9222
 * OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/health-vitals" npm run deploy
 * ```
 *
 * Dann:
 *
 * ```bash
 * npm run smoke:gui
 * npm run smoke:gui -- --port 9222 --vault 10_Pallas --section phasen
 * ```
 *
 * Das Dashboard braucht einen **importierten Cache** (`health-cache.json`); ohne ihn zeigt
 * es den Import-Screen und der Lauf bricht mit Ansage ab, statt rote Punkte zu melden.
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

import {
  Cdp,
  attachTo,
  closeExtraLeaves,
  pollUntil,
  requireVisible,
} from "../../tools/obsidian-cdp/cdp.js";
import { requireEigenerBuild } from "../../tools/obsidian-cdp/vault.js";

const PLUGIN_ID = "health-vitals";
/** `VIEW_TYPE_DASHBOARD` aus src/obsidian/dashboard-view.ts — historisch, bleibt (PROF-OBS-11). */
const VIEW_TYPE = "apple-health-dashboard";
/** `METRIC_SLEEP_ASLEEP` aus src/core/sleep-session.ts. */
const METRIC_SLEEP = "SleepAsleep";

/**
 * WCAG 2.2, 1.4.11 (Non-text Contrast): Flächen, die Information tragen, brauchen 3:1
 * gegen ihre Umgebung. Die Schwelle ist **nicht** an den Ist-Zustand angepasst worden —
 * sie stammt aus der Norm, und der defekte Stand vom 2026-08-18 lag mit 1,06:1 eine
 * Größenordnung darunter.
 */
const KONTRAST_MIN = 3;

/** `UNSPECIFIED_NOTE_THRESHOLD` aus src/core/view-model.ts. */
const NOTE_SCHWELLE = 0.5;

// --- Protokoll ---------------------------------------------------------------

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

const results: Check[] = [];

function record(name: string, passed: boolean, detail: string): void {
  results.push({ name, passed, detail });
  console.log(`${passed ? "  ✓" : "  ✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Eine Messung, die KEIN Urteil über den Prüfling erlaubt und deshalb nicht in die Bilanz
 *  geht. Sie steht trotzdem im Protokoll: der gemessene Wert ist echt, nur die
 *  Zurechnung fehlt (ein fremdes Theme belegt die Variablen, die unser CSS wählt). */
function hinweis(name: string, detail: string): void {
  console.log(`  · ${name} — ${detail}`);
}

/** Was der Lauf bewusst NICHT misst. Steht im Protokoll, damit eine Lücke nicht wie
 *  Abdeckung aussieht — ein stillschweigend ausgelassener Punkt liest sich hinterher wie
 *  ein grüner. */
function skipped(name: string, reason: string): void {
  console.log(`  – ${name} — übersprungen: ${reason}`);
}

// --- Farbrechnung (Node-Seite) ----------------------------------------------

/**
 * Eine computed-style-Farbe in Kanäle zerlegen.
 *
 * Zwei Schreibweisen, weil der Renderer beide liefert: `rgb(…)`/`rgba(…)` für einfache
 * Werte und **`color(srgb r g b [/ a])`** für alles, was aus `color-mix()` entsteht — mit
 * Kanälen im Bereich 0…1 statt 0…255. Ohne den zweiten Fall meldete der Kontrast-Prüfpunkt
 * am 2026-08-18 `?:1` für die Phase, die gerade auf `color-mix` umgestellt worden war: kein
 * Wert, also kein Beleg, also rot. Das war richtig — aber gemessen hätte er trotzdem werden
 * müssen.
 */
function parseColor(value: string | null): { r: number; g: number; b: number; a: number } | null {
  if (!value) return null;
  const modern = /color\(srgb\s+([^)]+)\)/.exec(value);
  if (modern) {
    const [kanaele, alpha] = modern[1].split("/");
    const parts = kanaele.trim().split(/\s+/).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
    return {
      r: parts[0] * 255,
      g: parts[1] * 255,
      b: parts[2] * 255,
      a: alpha === undefined ? 1 : Number(alpha.trim()),
    };
  }
  const match = /rgba?\(([^)]+)\)/.exec(value);
  if (!match) return null;
  const parts = match[1].split(",").map((p) => Number(p.trim()));
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

/** Relative Luminanz nach WCAG 2.x. */
function luminanz(c: { r: number; g: number; b: number }): number {
  const kanal = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * kanal(c.r) + 0.7152 * kanal(c.g) + 0.0722 * kanal(c.b);
}

/** Kontrastverhältnis zweier Farben, `null` wenn eine davon nicht lesbar ist.
 *  Teiltransparenz wird über den Hintergrund verrechnet — sonst meldete eine Fläche mit
 *  `opacity: 0.15` denselben Kontrast wie eine deckende. */
function kontrast(vordergrund: string | null, hintergrund: string | null): number | null {
  const vg = parseColor(vordergrund);
  const hg = parseColor(hintergrund);
  if (!vg || !hg) return null;
  const gemischt = {
    r: vg.r * vg.a + hg.r * (1 - vg.a),
    g: vg.g * vg.a + hg.g * (1 - vg.a),
    b: vg.b * vg.a + hg.b * (1 - vg.a),
  };
  const l1 = luminanz(gemischt);
  const l2 = luminanz(hg);
  const [hell, dunkel] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hell + 0.05) / (dunkel + 0.05);
}

/** Zwei Farben als „gleich" im Sinne einer Farbkollision. Nicht auf Zeichenkettengleichheit
 *  geprüft, weil `rgb(98, 114, 164)` und `rgba(98, 114, 164, 1)` dieselbe Farbe sind. */
function gleicheFarbe(a: string | null, b: string | null): boolean {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return false;
  return x.r === y.r && x.g === y.g && x.b === y.b && Math.abs(x.a - y.a) < 0.01;
}

const rundung = (n: number): string => n.toFixed(2);

// --- Renderer-Bausteine ------------------------------------------------------

/**
 * Im Renderer: den effektiven Hintergrund eines Elements finden.
 *
 * `getComputedStyle(svg).backgroundColor` ist bei einem SVG-Kind praktisch immer
 * `rgba(0, 0, 0, 0)` — gegen diese „Farbe" gerechnet käme jede Fläche auf einen
 * Traumkontrast. Gefragt ist deshalb die erste deckende Farbe in der Elternkette, also
 * das, was der Nutzer tatsächlich hinter der Fläche sieht.
 */
const BG_HELFER = `
  const bgOf = (start) => {
    let node = start;
    while (node && node !== document.documentElement) {
      const c = getComputedStyle(node).backgroundColor;
      const m = /rgba?\\(([^)]+)\\)/.exec(c);
      if (m) {
        const parts = m[1].split(",").map((p) => Number(p.trim()));
        const alpha = parts.length > 3 ? parts[3] : 1;
        if (alpha > 0.99) return c;
      }
      node = node.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor;
  };
`;

/** Im Renderer: das gerade sichtbare Dashboard-Panel. `:not(.is-hidden)` statt Index —
 *  die Reihenfolge der Tabs ist eine Annahme, die Sichtbarkeit ist die Sache selbst. */
const PANEL = `document.querySelector(".ah-dashboard .ah-panel:not(.is-hidden)")`;

/** Alle Phasen-Klassen, die ein Element trägt (`ah-stage-deep` → `deep`). */
const STAGE_HELFER = `
  const stageOf = (el) =>
    [...el.classList].filter((c) => c.startsWith("ah-stage-") && c !== "ah-stage-note")
      .map((c) => c.slice("ah-stage-".length))[0] ?? null;
`;

// --- Szene -------------------------------------------------------------------

interface SzenenInfo {
  hatCache: boolean;
  breite: number;
}

async function oeffneDashboard(cdp: Cdp): Promise<SzenenInfo> {
  return cdp.evaluate<SzenenInfo>(`
    await app.commands.executeCommandById(${JSON.stringify(`${PLUGIN_ID}:open-dashboard`)});
    await new Promise((r) => setTimeout(r, 1200));
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    // Der Import-Screen ist kein Defekt, sondern eine fehlende Voraussetzung: ohne Cache
    // gibt es keine Tabs, und jeder Prüfpunkt wäre rot, ohne dass am Plugin etwas fehlt.
    // Die Klasse ah-dashboard sitzt AUF dem contentEl (renderRoot addet sie dort), nicht
    // darin — ein querySelector darauf findet nichts und meldete 0px Ansichtsbreite.
    const root = leaf?.view?.contentEl;
    return {
      hatCache: Boolean(root?.querySelector(".ah-tabbar")),
      breite: root ? Math.round(root.getBoundingClientRect().width) : 0,
    };
  `);
}

/**
 * Beide Sidebars einklappen — die Szene, in der gemessen wird, gehört hergestellt und
 * nicht vorgefunden.
 *
 * Gemessen am 2026-08-18 im Arbeits-Vault: bei 902 px Fensterbreite belegten die offenen
 * Sidebars 296 + 415 px, für das Dashboard blieben **123 px**. Ein Chart dieser Breite
 * bringt 137 Segmente auf 0,01 px² — „hat Fläche" wird dort zur Zufallsfrage, und was
 * gemessen wird, ist das Layout des Maintainers statt des Plugins.
 *
 * Rückgabe ist der Vorzustand für das `finally`.
 */
async function klappeSidebarsEin(cdp: Cdp): Promise<{ links: boolean; rechts: boolean }> {
  return cdp.evaluate<{ links: boolean; rechts: boolean }>(`
    const vorher = {
      links: Boolean(app.workspace.leftSplit?.collapsed),
      rechts: Boolean(app.workspace.rightSplit?.collapsed),
    };
    app.workspace.leftSplit?.collapse();
    app.workspace.rightSplit?.collapse();
    await new Promise((r) => setTimeout(r, 500));
    return vorher;
  `);
}

async function stelleSidebarsWiederHer(cdp: Cdp, vorher: { links: boolean; rechts: boolean }): Promise<void> {
  await cdp.evaluate(`
    const vorher = ${JSON.stringify(vorher)};
    if (!vorher.links) app.workspace.leftSplit?.expand();
    if (!vorher.rechts) app.workspace.rightSplit?.expand();
    return true;
  `);
}

/**
 * Detail-Tab auf eine Metrik stellen. Die Metrikwahl läuft über die View-API (Szene
 * herstellen), gemessen wird danach ausschließlich am DOM.
 *
 * Die Ausnahme des Prüflings wird **gefangen und zurückgegeben**, nicht durchgereicht:
 * Ein Render, der wirft, ist ein Befund und gehört als roter Punkt ins Protokoll — reicht
 * man ihn durch, reisst er stattdessen den ganzen Lauf ab und alle folgenden Punkte
 * bleiben ungemessen. Genau so verhielt sich Fehler 2 vom 2026-08-18 in der Gegenprobe:
 * `createSvg` warf am ersten Segment, und der Treiber meldete „Abbruch" statt „Render
 * wirft".
 */
async function zeigeMetrik(cdp: Cdp, metricId: string): Promise<{ ok: boolean; fehler: string | null }> {
  return cdp.evaluate<{ ok: boolean; fehler: string | null }>(`
    const leaf = app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)})[0];
    if (!leaf) return { ok: false, fehler: "Dashboard-View nicht erreichbar" };
    try {
      leaf.view.openDetail(${JSON.stringify(metricId)});
    } catch (e) {
      await new Promise((r) => setTimeout(r, 300));
      return { ok: false, fehler: String(e && e.message ? e.message : e) };
    }
    await new Promise((r) => setTimeout(r, 600));
    return { ok: true, fehler: null };
  `);
}

/**
 * Szene herstellen und das Ergebnis als Prüfpunkt festhalten.
 *
 * Ein Fehlschlag wird IMMER protokolliert, auch in den Abschnitten, die das Herstellen
 * sonst still voraussetzen: Ohne Szene liefern die folgenden Messungen „übersprungen", und
 * eine Reihe von Skips liest sich hinterher wie Abdeckung. `auchGruen` steuert nur, ob der
 * gelungene Fall eine eigene Zeile bekommt — einmal reicht.
 */
async function stelleDetailHer(cdp: Cdp, name: string, auchGruen: boolean): Promise<boolean> {
  const r = await zeigeMetrik(cdp, METRIC_SLEEP);
  if (!r.ok || auchGruen) record(name, r.ok, r.fehler ?? "Render durchgelaufen");
  return r.ok;
}

/** Workouts-Tab öffnen. Wie `stelleDetailHer`: ein Fehlschlag wird protokolliert, damit
 *  eine Reihe von Skips hinterher nicht wie Abdeckung aussieht. */
async function stelleWorkoutsHer(cdp: Cdp): Promise<boolean> {
  const ok = await cdp.evaluate<boolean>(`
    const root = document.querySelector(".ah-dashboard");
    const tab = root?.querySelectorAll(".ah-tabbar .ah-tab")[2];
    if (!tab) return false;
    tab.click();
    await new Promise((r) => setTimeout(r, 600));
    return !!${PANEL}?.querySelector(".ah-workout-list");
  `);
  record("Workouts-Szene herstellbar", ok === true, ok ? "Tab offen" : "kein `.ah-workout-list` im offenen Panel");
  return ok === true;
}

/** Zeitraum über die Schaltfläche wählen — der echte Weg des Nutzers.
 *  `index` folgt `RANGES` in src/obsidian/tabs/detail.ts: 0=1M, 1=3M, 2=1Y, 3=Alles.
 *  Die **erste** `.ah-range-bar` im Panel ist die Zeitraum-Leiste; eine zweite gleicher
 *  Klasse steht in der Export-Zeile (MD/CSV). */
async function waehleZeitraum(cdp: Cdp, index: number): Promise<string | null> {
  return cdp.evaluate<string | null>(`
    const panel = ${PANEL};
    const bar = panel?.querySelector(".ah-range-bar");
    const btn = bar?.querySelectorAll(".ah-range-btn")[${index}];
    if (!btn) return null;
    btn.click();
    await new Promise((r) => setTimeout(r, 800));
    return btn.textContent;
  `);
}

// --- Abschnitt: Gerüst -------------------------------------------------------

async function pruefeGeruest(cdp: Cdp): Promise<void> {
  const tabs = await cdp.evaluate<{ tabs: number; panels: number } | null>(`
    const root = document.querySelector(".ah-dashboard");
    if (!root) return null;
    return {
      tabs: root.querySelectorAll(".ah-tabbar .ah-tab").length,
      panels: root.querySelectorAll(".ah-content .ah-panel").length,
    };
  `);
  record(
    "Dashboard-Gerüst",
    tabs !== null && tabs.tabs === 3 && tabs.panels === 3,
    tabs === null ? "`.ah-dashboard` nicht im DOM" : `${tabs.tabs} Tabs, ${tabs.panels} Panels (erwartet 3/3)`,
  );

  // Tab-Wechsel am Effekt gemessen, nicht an der Klasse: `is-active`/`is-hidden` waren im
  // Defektfall vom 2026-08-18 durchgehend korrekt gesetzt — sichtbar war trotzdem nichts.
  const wechsel = await cdp.evaluate<{ sichtbar: number; hoehe: number; hatRange: boolean } | null>(`
    const root = document.querySelector(".ah-dashboard");
    if (!root) return null;
    const detailTab = root.querySelectorAll(".ah-tabbar .ah-tab")[1];
    if (!detailTab) return null;
    detailTab.click();
    await new Promise((r) => setTimeout(r, 600));
    const panels = [...root.querySelectorAll(".ah-content .ah-panel")];
    const offen = panels.filter((p) => p.getBoundingClientRect().height > 0);
    return {
      sichtbar: offen.length,
      hoehe: offen[0] ? Math.round(offen[0].getBoundingClientRect().height) : 0,
      hatRange: Boolean(offen[0]?.querySelector(".ah-range-bar, .ah-detail-hint")),
    };
  `);
  record(
    "Tab-Wechsel wirkt sichtbar",
    wechsel !== null && wechsel.sichtbar === 1 && wechsel.hoehe > 0 && wechsel.hatRange,
    wechsel === null
      ? "Detail-Tab nicht gefunden"
      : `${wechsel.sichtbar} Panel sichtbar, ${wechsel.hoehe}px hoch, Detail-Inhalt: ${wechsel.hatRange ? "ja" : "nein"}`,
  );
}

async function pruefeSparkline(cdp: Cdp): Promise<void> {
  const spark = await cdp.evaluate<{ w: number; h: number } | null>(`
    const root = document.querySelector(".ah-dashboard");
    // Erst zurück auf die Übersicht: Im ausgeblendeten Panel (display: none) misst
    // jede Bounding-Box 0 — der Punkt wäre rot, ohne dass an der Sparkline etwas fehlt.
    root?.querySelectorAll(".ah-tabbar .ah-tab")[0]?.click();
    await new Promise((r) => setTimeout(r, 500));
    const uebersicht = root?.querySelector(".ah-content .ah-panel:not(.is-hidden)");
    const svg = uebersicht?.querySelector(".ah-tile-spark svg");
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  `);
  if (spark === null) {
    skipped("Sparkline hat Fläche", "keine Kachel in der Übersicht (leerer Cache?)");
    return;
  }
  // Die Sparkline überschreibt die allgemeine Chart-Höhe bewusst (`.ah-tile-spark svg`,
  // höhere Spezifität). Sie ist damit der Punkt, an dem eine Umstellung der Maßregel
  // zuerst kippt — deshalb eigene Messung statt „irgendein SVG hat Fläche".
  record(
    "Sparkline hat Fläche",
    spark.w > 0 && spark.h > 0,
    `${spark.w}×${spark.h}px`,
  );
}

// --- Abschnitt: Detail-Chart -------------------------------------------------

async function pruefeDetailChart(cdp: Cdp): Promise<void> {
  const flaeche = await cdp.evaluate<{ w: number; h: number } | null>(`
    const svg = ${PANEL}?.querySelector(".ah-detail-chart .ah-chart");
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  `);
  if (flaeche === null) {
    record("Detail-Chart hat Fläche", false, "kein `.ah-detail-chart .ah-chart` im sichtbaren Panel");
    return;
  }
  // Fehler 1 vom 2026-08-18: Elemente da, Geometrie korrekt, Fläche 0.
  record("Detail-Chart hat Fläche", flaeche.w > 0 && flaeche.h > 0, `${flaeche.w}×${flaeche.h}px`);

  const inhalt = await cdp.evaluate<{ art: string; anzahl: number; minFlaeche: number } | null>(`
    const svg = ${PANEL}?.querySelector(".ah-detail-chart .ah-chart");
    if (!svg) return null;
    const bars = [...svg.querySelectorAll(".ah-chart-bar")];
    if (bars.length > 0) {
      const flaechen = bars.map((b) => {
        const r = b.getBoundingClientRect();
        return r.width * r.height;
      });
      return { art: "Balken", anzahl: bars.length, minFlaeche: Math.min(...flaechen) };
    }
    const line = svg.querySelector(".ah-chart-line");
    if (line) {
      const r = line.getBoundingClientRect();
      return { art: "Linie", anzahl: 1, minFlaeche: r.width * r.height };
    }
    return { art: "nichts", anzahl: 0, minFlaeche: 0 };
  `);
  record(
    "Chart-Inhalt hat Fläche",
    inhalt !== null && inhalt.anzahl > 0 && inhalt.minFlaeche > 0,
    inhalt === null ? "Chart fehlt" : `${inhalt.anzahl}× ${inhalt.art}, kleinste Fläche ${rundung(inhalt.minFlaeche)}px²`,
  );

  const achsen = await cdp.evaluate<{ yBreite: number; yLabels: number; xLabels: number; yLabelBreite: number } | null>(`
    const frame = ${PANEL}?.querySelector(".ah-detail-chart .ah-chart-frame");
    if (!frame) return null;
    const yCol = frame.querySelector(".ah-axis-y");
    const yLabels = [...frame.querySelectorAll(".ah-axis-y .ah-axis-label")];
    const xLabels = [...frame.querySelectorAll(".ah-axis-x .ah-axis-label")];
    return {
      yBreite: yCol ? Math.round(yCol.getBoundingClientRect().width) : 0,
      yLabels: yLabels.length,
      xLabels: xLabels.length,
      yLabelBreite: yLabels.length
        ? Math.round(Math.min(...yLabels.map((l) => l.getBoundingClientRect().width)))
        : 0,
    };
  `);
  // Die y-Spaltenbreite wird pro Render inline gesetzt (die Labels sitzen absolut und
  // tragen nichts zur Shrink-to-fit-Breite bei) — fällt diese Zeile weg, kollabiert die
  // Spalte auf den 1ch-Fallback und die Beschriftung überlappt das Chart.
  record(
    "Achsenbeschriftung sichtbar",
    achsen !== null && achsen.yBreite > 0 && achsen.yLabels > 0 && achsen.xLabels > 0 && achsen.yLabelBreite > 0,
    achsen === null
      ? "kein `.ah-chart-frame`"
      : `y-Spalte ${achsen.yBreite}px, ${achsen.yLabels} y-Labels (schmalstes ${achsen.yLabelBreite}px), ${achsen.xLabels} x-Labels`,
  );

  // Achsenbeschriftung, die sich selbst überlagert, ist gerendert und trotzdem unlesbar —
  // wieder ein Effekt aus der Kombination (Anzahl Ticks × Containerbreite × Schriftgröße),
  // den weder Geometrie- noch DOM-Test sehen kann. Gemessen wird in der hergestellten
  // Szene (Sidebars eingeklappt), nicht in einem beliebig schmalen Blatt.
  const ueberlappung = await cdp.evaluate<{ paare: number; anzahl: number; luecke: number } | null>(`
    const labels = [...(${PANEL}?.querySelectorAll(".ah-detail-chart .ah-axis-x .ah-axis-label") ?? [])];
    if (labels.length < 2) return null;
    const boxen = labels.map((l) => l.getBoundingClientRect()).sort((a, b) => a.left - b.left);
    let paare = 0;
    let luecke = Infinity;
    for (let i = 0; i + 1 < boxen.length; i++) {
      const abstand = boxen[i + 1].left - boxen[i].right;
      if (abstand < 0) paare += 1;
      if (abstand < luecke) luecke = abstand;
    }
    return { paare, anzahl: boxen.length, luecke: Math.round(luecke) };
  `);
  if (ueberlappung === null) {
    skipped("x-Beschriftung überlappt nicht", "weniger als zwei x-Labels");
  } else {
    record(
      "x-Beschriftung überlappt nicht",
      ueberlappung.paare === 0,
      `${ueberlappung.anzahl} Labels, kleinster Abstand ${ueberlappung.luecke}px`
        + (ueberlappung.paare ? `, ${ueberlappung.paare} überlappende Paare` : ""),
    );
  }

  const wochen = await cdp.evaluate<{ anzahl: number; woche: string; gitter: string } | null>(`
    const svg = ${PANEL}?.querySelector(".ah-detail-chart .ah-chart");
    if (!svg) return null;
    const woche = svg.querySelector(".ah-chart-week");
    const gitter = svg.querySelector(".ah-chart-grid");
    return {
      anzahl: svg.querySelectorAll(".ah-chart-week").length,
      woche: woche ? getComputedStyle(woche).strokeDasharray : "",
      gitter: gitter ? getComputedStyle(gitter).strokeDasharray : "",
    };
  `);
  if (wochen === null || wochen.anzahl === 0) {
    skipped("Wochenlinien qualitativ unterschieden", "keine Wochenmarken im gewählten Zeitraum");
  } else {
    // Lehre aus Slice 3c: Ein Element mit eigener Aussage darf sich nicht nur quantitativ
    // (blasser, dünner) von der Hilfsgeometrie abheben, gegen die es sich abheben soll —
    // der Unterschied muss qualitativ sein. Gemessen wird deshalb das Strichmuster.
    const eigenes = wochen.woche !== "" && wochen.woche !== "none";
    record(
      "Wochenlinien qualitativ unterschieden",
      eigenes && wochen.woche !== wochen.gitter,
      `${wochen.anzahl} Linien, Strichmuster „${wochen.woche || "none"}" vs. Gitter „${wochen.gitter || "none"}"`,
    );
  }
}

// --- Abschnitt: Schlafphasen -------------------------------------------------

interface StageMessung {
  stage: string;
  fill: string;
  swatch: string | null;
  anzahl: number;
  flaeche: number;
}

interface PhasenMessung {
  segmente: number;
  minFlaeche: number;
  titel: number;
  leereTitel: number;
  legende: string[];
  xLabels: number;
  statZellen: number;
  hatNote: boolean;
  hintergrund: string;
  stages: StageMessung[];
}

async function messePhasen(cdp: Cdp): Promise<PhasenMessung | null> {
  return cdp.evaluate<PhasenMessung | null>(`
    ${BG_HELFER}
    ${STAGE_HELFER}
    const box = ${PANEL}?.querySelector(".ah-stages");
    if (!box) return null;
    const svg = box.querySelector(".ah-chart");
    if (!svg) return null;
    const segmente = [...svg.querySelectorAll(".ah-chart-stack")];

    const proStage = new Map();
    let minFlaeche = Infinity;
    for (const seg of segmente) {
      const r = seg.getBoundingClientRect();
      const flaeche = r.width * r.height;
      if (flaeche < minFlaeche) minFlaeche = flaeche;
      const stage = stageOf(seg);
      if (!stage) continue;
      const bisher = proStage.get(stage);
      if (bisher) {
        bisher.anzahl += 1;
        bisher.flaeche += flaeche;
      } else {
        const swatchEl = box.parentElement?.querySelector(
          ".ah-legend .ah-legend-swatch.ah-stage-" + stage,
        );
        proStage.set(stage, {
          stage,
          fill: getComputedStyle(seg).fill,
          swatch: swatchEl ? getComputedStyle(swatchEl).backgroundColor : null,
          anzahl: 1,
          flaeche,
        });
      }
    }

    const titel = [...svg.querySelectorAll(".ah-chart-stack > title")];
    return {
      segmente: segmente.length,
      minFlaeche: segmente.length ? minFlaeche : 0,
      titel: titel.length,
      leereTitel: titel.filter((t) => !t.textContent || !t.textContent.trim()).length,
      legende: [...box.parentElement.querySelectorAll(".ah-legend .ah-legend-swatch")]
        .map((el) => stageOf(el)).filter(Boolean),
      xLabels: box.querySelectorAll(".ah-axis-x .ah-axis-label").length,
      statZellen: box.querySelectorAll(".ah-stat-row .ah-stat-cell").length,
      hatNote: Boolean(box.parentElement.querySelector(".ah-stage-note")),
      hintergrund: bgOf(svg),
      stages: [...proStage.values()],
    };
  `);
}

/** Die Prüfpunkte, die für jede Theme-Variante gelten: Kontrast und Kollisionsfreiheit.
 *  `praefix` benennt die Variante im Protokoll. */
function pruefeFarben(m: PhasenMessung, praefix: string, verbindlich: boolean): void {
  const melde = (name: string, ok: boolean, detail: string): void => {
    if (verbindlich) record(name, ok, detail);
    else hinweis(name, `${detail} — ${ok ? "erfüllt" : "VERFEHLT"}, nicht in der Bilanz`);
  };
  const kontraste = m.stages.map((s) => ({ stage: s.stage, wert: kontrast(s.fill, m.hintergrund) }));
  const schlechteste = kontraste.reduce<{ stage: string; wert: number | null } | null>(
    (min, k) => (min === null || (k.wert !== null && min.wert !== null && k.wert < min.wert) ? k : min),
    null,
  );
  // Fehler 3 vom 2026-08-18: `--background-modifier-border` als Füllfarbe, 1,06:1.
  melde(
    `${praefix}Phasenfarben haben Kontrast (≥ ${KONTRAST_MIN}:1)`,
    kontraste.length > 0 && kontraste.every((k) => k.wert !== null && k.wert >= KONTRAST_MIN),
    kontraste.length === 0
      ? "keine Phase gemessen"
      : kontraste.map((k) => `${k.stage} ${k.wert === null ? "?" : rundung(k.wert)}:1`).join(", ")
        + (schlechteste?.wert != null ? ` (schwächste: ${schlechteste.stage})` : ""),
  );

  // `--text-faint` schied als Farbe für „unbestimmt" aus, weil es in Kuro exakt
  // `--color-blue` ist — Variablennamen sagen nichts über Kollisionsfreiheit. Ein Theme,
  // das zwei der benutzten Variablen gleich belegt, macht zwei Phasen ununterscheidbar,
  // ohne dass an diesem Repo etwas falsch wäre. Genau deshalb wird es gemessen.
  const kollisionen: string[] = [];
  for (let i = 0; i < m.stages.length; i++) {
    for (let j = i + 1; j < m.stages.length; j++) {
      if (gleicheFarbe(m.stages[i].fill, m.stages[j].fill)) {
        kollisionen.push(`${m.stages[i].stage}=${m.stages[j].stage}`);
      }
    }
  }
  melde(
    `${praefix}Phasenfarben paarweise verschieden`,
    m.stages.length > 0 && kollisionen.length === 0,
    kollisionen.length ? `Kollision: ${kollisionen.join(", ")}` : `${m.stages.length} Phasen, keine Kollision`,
  );
}

async function pruefePhasen(cdp: Cdp): Promise<PhasenMessung | null> {
  const m = await messePhasen(cdp);
  if (m === null) {
    skipped("Schlafphasen-Chart", "keine Phasen-Sektion im Zeitraum (Cache ohne Phasendaten?)");
    return null;
  }

  record("Phasen-Segmente gerendert", m.segmente > 0, `${m.segmente} Segmente`);

  // Fehler 1, an den Segmenten selbst: 226 korrekt berechnete Rechtecke mit Fläche 0.
  record(
    "Jedes Segment hat Fläche",
    m.segmente > 0 && m.minFlaeche > 0,
    `kleinste Segmentfläche ${rundung(m.minFlaeche)}px²`,
  );

  // Fehler 2: `createSvg` warf am ERSTEN Segment — alles danach fehlte, während die
  // vorher gebauten Teile (y-Achse, Gitter) tadellos dastanden. Ein Zähler auf die
  // Segmente allein hätte das gesehen, ein Zähler auf „Sektion vorhanden" nicht.
  // Deshalb: was NACH den Segmenten gebaut wird, muss vollständig da sein — und die
  // Legende führt genau die Phasen, die im Chart vorkommen.
  const imChart = [...new Set(m.stages.map((s) => s.stage))].sort();
  const inLegende = [...new Set(m.legende)].sort();
  const deckungsgleich = imChart.length > 0 && imChart.join(",") === inLegende.join(",");
  record(
    "Render lief zu Ende",
    deckungsgleich && m.xLabels > 0 && m.statZellen > 0,
    `Chart [${imChart.join(", ")}] vs. Legende [${inLegende.join(", ")}], `
      + `${m.xLabels} x-Labels, ${m.statZellen} Statistik-Zellen`,
  );

  // Die Legende ist nur dann eine, wenn sie exakt die Farbe des Charts zeigt: Segment
  // (`fill`) und Swatch (`background-color`) stehen in einer gemeinsamen Regel je Phase,
  // damit sie beim nächsten Eingriff nicht auseinanderlaufen. Hier wird das nachgemessen.
  const abweichend = m.stages.filter((s) => !gleicheFarbe(s.fill, s.swatch)).map((s) => s.stage);
  record(
    "Legende zeigt die Chart-Farbe",
    m.stages.length > 0 && abweichend.length === 0,
    abweichend.length ? `abweichend: ${abweichend.join(", ")}` : `${m.stages.length} Phasen deckungsgleich`,
  );

  // Die Farbe trägt die Zuordnung nur mit — jedes Segment nennt Phase und Dauer in einem
  // `<title>` (Tooltip und Screenreader, WCAG 1.4.1). Ein fehlender Titel ist unsichtbar,
  // solange niemand hovert.
  record(
    "Jedes Segment hat einen Tooltip",
    m.segmente > 0 && m.titel === m.segmente && m.leereTitel === 0,
    `${m.titel}/${m.segmente} Titel, davon ${m.leereTitel} leer`,
  );

  return m;
}

/**
 * Die Hinweiszeile folgt den Daten, nicht dem Zeitraum.
 *
 * Formuliert als **Äquivalenz**, nicht als erwarteter Zustand: Ob die Zeile stehen muss,
 * hängt vom Vault ab (am echten Export greift die Schwelle bei „Alles", bei „1J" nicht) —
 * ein Prüfpunkt mit nur einem richtigen Ausgang wäre hier dauerhaft rot oder dauerhaft
 * nichtssagend. Der Anteil wird aus den **gerenderten Flächen** gerechnet, also unabhängig
 * von der Rechnung im ViewModel; sonst prüfte der Punkt den Code gegen sich selbst.
 */
function pruefeHinweiszeile(m: PhasenMessung, zeitraum: string): void {
  // Erst den Gegenstand belegen, dann die Eigenschaft: Ohne Segmente ist der Anteil 0 und
  // die Zeile fehlt — die Äquivalenz wäre erfüllt und der Punkt grün, ausgerechnet im
  // Defektfall. In der Gegenprobe vom 2026-08-18 (Render-Abbruch, 0 Segmente) war er
  // genau deshalb einer von zwei grünen Punkten in einem durchgefallenen Lauf.
  if (m.segmente === 0) {
    record(
      `Hinweiszeile folgt dem Anteil (${zeitraum})`,
      false,
      "keine Segmente gerendert — der Anteil hat keinen Gegenstand",
    );
    return;
  }
  const gesamt = m.stages.reduce((s, x) => s + x.flaeche, 0);
  const unbestimmt = m.stages.find((s) => s.stage === "unspecified")?.flaeche ?? 0;
  const anteil = gesamt > 0 ? unbestimmt / gesamt : 0;
  const erwartet = anteil > NOTE_SCHWELLE;
  record(
    `Hinweiszeile folgt dem Anteil (${zeitraum})`,
    erwartet === m.hatNote,
    `${(anteil * 100).toFixed(1)} % unbestimmt, Zeile ${m.hatNote ? "da" : "nicht da"} (erwartet: ${erwartet ? "da" : "nicht da"})`,
  );
}

// --- Abschnitt: Theme-Gegenprobe --------------------------------------------

/** Body-Klasse tauschen statt `app.changeTheme`: Das schriebe nach
 *  `.obsidian/appearance.json` und machte aus einem system-folgenden Vault einen fest
 *  eingestellten. Die Klasse ist die flüchtigste Ebene mit derselben Wirkung auf die
 *  CSS-Variablen. */
async function setzeTheme(cdp: Cdp, dunkel: boolean): Promise<void> {
  await cdp.evaluate(`
    document.body.classList.toggle("theme-dark", ${String(dunkel)});
    document.body.classList.toggle("theme-light", ${String(!dunkel)});
    app.workspace.trigger("css-change");
    await new Promise((r) => setTimeout(r, 500));
    return true;
  `);
}

/**
 * Das Theme-CSS abschalten, ohne etwas zu schreiben.
 *
 * `app.customCss.setTheme("")` schriebe nach `.obsidian/appearance.json` und machte aus
 * dem eingestellten Theme des Maintainers dauerhaft „keins". Das Style-Element zu
 * deaktivieren hat dieselbe Wirkung auf die Variablen und überlebt keinen Neustart —
 * die flüchtigste Ebene mit demselben Effekt.
 */
async function setzeThemeCss(cdp: Cdp, an: boolean): Promise<void> {
  await cdp.evaluate(`
    const el = app.customCss?.styleEl;
    if (el) el.disabled = ${String(!an)};
    app.workspace.trigger("css-change");
    await new Promise((r) => setTimeout(r, 400));
    return true;
  `);
}

/**
 * Ist der Vault ein tauglicher Messplatz für Farben?
 *
 * Das Theme-CSS lässt sich abschalten (`styleEl.disabled`), CSS-Snippets und
 * Style-Settings **nicht** — die schreiben ihre Werte in eigene Style-Elemente und
 * überleben das. Eine „Standard"-Messung in einem so eingerichteten Vault misst dann
 * weiter fremde Belegungen und schreibt sie unserem CSS zu.
 *
 * Deshalb: Farben werden nur dort **verbindlich** gemessen, wo die Messung etwas über
 * das Plugin aussagt. Sonst übersprungen, mit Nennung des Hinderungsgrunds — nicht rot,
 * denn ein fremd belegtes `--color-cyan` ist kein Fehler dieses Repos.
 */
async function messplatzLage(cdp: Cdp): Promise<{ vanilla: boolean; grund: string }> {
  const lage = await cdp.evaluate<{ snippets: string[]; styleSettings: boolean }>(`
    return {
      snippets: [...(app.customCss?.enabledSnippets ?? [])],
      styleSettings: Boolean(app.plugins?.enabledPlugins?.has("obsidian-style-settings")),
    };
  `);
  const gruende: string[] = [];
  if (lage.snippets.length > 0) gruende.push(`${lage.snippets.length} aktive CSS-Snippets`);
  if (lage.styleSettings) gruende.push("Style-Settings-Plugin aktiv");
  return { vanilla: gruende.length === 0, grund: gruende.join(" + ") };
}

/**
 * Die Farbprüfung — verbindlich nur gegen Obsidians **Standardbelegung**.
 *
 * Die Trennung ist der Punkt: Unser CSS wählt Variablen, ein Theme belegt sie. Gegen die
 * Standardbelegung muss die Wahl tragen; was ein fremdes Theme daraus macht, kann kein
 * Plugin garantieren und gehört deshalb nicht in die Bilanz. Der Wert wird trotzdem
 * gemessen und als Hinweis protokolliert — er ist echt, nur nicht zurechenbar.
 */
async function pruefeFarbenInThemes(cdp: Cdp, warDunkel: boolean, themeName: string): Promise<void> {
  const platz = await messplatzLage(cdp);

  await setzeThemeCss(cdp, false);
  for (const dunkel of [true, false]) {
    await setzeTheme(cdp, dunkel);
    const m = await messePhasen(cdp);
    const name = dunkel ? "dunkel" : "hell";
    if (m === null || m.segmente === 0) {
      skipped(`Standard ${name}: Phasenfarben`, "Phasen-Sektion nicht messbar");
      continue;
    }
    if (!platz.vanilla) {
      skipped(
        `Standard ${name}: Phasenfarben`,
        `kein sauberer Messplatz (${platz.grund}) — die Variablen sind auch ohne Theme-CSS fremd belegt. `
        + "Verbindlich messbar nur in einem vanilla Vault.",
      );
      pruefeFarben(m, `Standard ${name}: `, false);
      continue;
    }
    pruefeFarben(m, `Standard ${name}: `, true);
  }

  await setzeThemeCss(cdp, true);
  for (const dunkel of [warDunkel, !warDunkel]) {
    await setzeTheme(cdp, dunkel);
    const m = await messePhasen(cdp);
    const name = dunkel ? "dunkel" : "hell";
    if (m === null || m.segmente === 0) continue;
    pruefeFarben(m, `Theme ${themeName} ${name}: `, false);
  }
  await setzeTheme(cdp, warDunkel);
}

// --- Abschnitt: Werte-Sektion ------------------------------------------------

async function pruefeWerteSektion(cdp: Cdp): Promise<void> {
  const werte = await cdp.evaluate<{ zeilen: number; hoehe: number; breite: number } | null>(`
    const panel = ${PANEL};
    const header = panel?.querySelector(".okit-collapsible-header");
    if (!header) return null;
    // Aufklappen nur, wenn zu — ein blinder Klick schlösse eine offene Sektion.
    const wrapVorher = panel.querySelector(".ah-table-wrap");
    if (!wrapVorher || wrapVorher.getBoundingClientRect().height === 0) {
      header.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    const table = panel.querySelector(".ah-table");
    if (!table) return null;
    const r = table.getBoundingClientRect();
    return {
      zeilen: table.querySelectorAll("tbody tr").length,
      hoehe: Math.round(r.height),
      breite: Math.round(r.width),
    };
  `);
  if (werte === null) {
    skipped("Werte-Tabelle sichtbar", "keine Werte-Sektion (Zeitraum ohne Punkte?)");
    return;
  }
  record(
    "Werte-Tabelle sichtbar",
    werte.zeilen > 0 && werte.hoehe > 0 && werte.breite > 0,
    `${werte.zeilen} Zeilen, ${werte.breite}×${werte.hoehe}px`,
  );
}

// --- Abschnitt: Workouts-Kennzahlen ------------------------------------------

async function pruefeWorkouts(cdp: Cdp): Promise<void> {
  const summe = await cdp.evaluate<{ da: boolean; text: string } | null>(`
    const panel = ${PANEL};
    const zeile = panel?.querySelector(".ah-workout-total");
    if (!zeile) return null;
    return { da: zeile.getBoundingClientRect().height > 0, text: zeile.textContent ?? "" };
  `);
  // Als Äquivalenz formuliert (wie Prüfpunkt 15): ob "km" in der Zeile steht, hängt vom
  // Vault ab — ein jüngster Monat mit nur Kraft/Yoga/HIIT zeigt dort korrekt "—". Verlangt
  // wird deshalb eine Ziffer ODER der Gedankenstrich, nicht die Einheit "km".
  record(
    "Workouts — Monatssumme",
    summe !== null && summe.da && (/\d/.test(summe.text) || summe.text.includes("—")),
    summe === null ? "`.ah-workout-total` nicht im DOM" : `sichtbar=${summe.da}, Text: ${summe.text}`,
  );

  // Am Text gemessen, nicht am Vorhandensein des Elements: Ein leerer Span hat dieselbe
  // Klasse wie ein gefüllter — genau der Fehlerfall vom 2026-08-18, bei dem alle Elemente
  // da waren und trotzdem nichts zu sehen war.
  const zellen = await cdp.evaluate<{ gesamt: number; gefuellt: number } | null>(`
    const panel = ${PANEL};
    const rows = [...(panel?.querySelectorAll(".ah-workout-row") ?? [])];
    if (rows.length === 0) return null;
    const spans = rows.flatMap((r) => [...r.querySelectorAll(".ah-workout-dist, .ah-workout-kcal")]);
    return {
      gesamt: spans.length,
      gefuellt: spans.filter((s) => (s.textContent ?? "").trim().length > 0).length,
    };
  `);
  record(
    "Workouts — Zeilenwerte gefuellt",
    zellen !== null && zellen.gesamt > 0 && zellen.gefuellt === zellen.gesamt,
    zellen === null ? "keine `.ah-workout-row` im DOM" : `${zellen.gefuellt}/${zellen.gesamt} Zellen mit Text`,
  );
}

// --- Abschnitte --------------------------------------------------------------

interface Section {
  key: string;
  title: string;
  run: (cdp: Cdp) => Promise<void>;
}

/** Zustand, den die Abschnitte untereinander weiterreichen. */
let themeWarDunkel = true;
let themeName = "(Standard)";

const SECTIONS: Section[] = [
  {
    key: "geruest",
    title: "Dashboard-Gerüst",
    run: async (cdp) => {
      await pruefeGeruest(cdp);
      await pruefeSparkline(cdp);
    },
  },
  {
    key: "detail",
    title: "Detail-Chart",
    run: async (cdp) => {
      await stelleDetailHer(cdp, "Detail-Render wirft keine Ausnahme", true);
      await waehleZeitraum(cdp, 1); // 3M — dort gibt es Wochenmarken
      await pruefeDetailChart(cdp);
    },
  },
  {
    key: "phasen",
    title: "Schlafphasen-Chart",
    run: async (cdp) => {
      await stelleDetailHer(cdp, "Phasen-Szene herstellbar", false);

      const alles = await waehleZeitraum(cdp, 3);
      const mAlles = await pruefePhasen(cdp);
      if (mAlles) pruefeHinweiszeile(mAlles, alles ?? "Alles");

      // Zweiter Zeitraum ausschliesslich für die Hinweiszeile: erst der Wechsel zwischen
      // einem Anteil über und einem unter der Schwelle zeigt, dass die Zeile den Daten
      // folgt und nicht bloss immer (oder nie) da ist.
      const kurz = await waehleZeitraum(cdp, 0);
      const mKurz = await messePhasen(cdp);
      if (mKurz) pruefeHinweiszeile(mKurz, kurz ?? "1M");
      else skipped("Hinweiszeile folgt dem Anteil (1M)", "keine Phasen-Sektion im kurzen Zeitraum");
    },
  },
  {
    key: "farben",
    title: "Farben (verbindlich nur gegen die Standardbelegung)",
    run: async (cdp) => {
      await stelleDetailHer(cdp, "Farb-Szene herstellbar", false);
      await waehleZeitraum(cdp, 3);
      await pruefeFarbenInThemes(cdp, themeWarDunkel, themeName);
    },
  },
  {
    key: "werte",
    title: "Werte-Sektion",
    run: async (cdp) => {
      await stelleDetailHer(cdp, "Werte-Szene herstellbar", false);
      await waehleZeitraum(cdp, 0);
      await pruefeWerteSektion(cdp);
    },
  },
  {
    key: "workouts",
    title: "Workouts-Kennzahlen",
    run: async (cdp) => {
      if (!(await stelleWorkoutsHer(cdp))) return;
      await pruefeWorkouts(cdp);
    },
  },
];

// --- Lauf --------------------------------------------------------------------

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const port = Number(flag("port") ?? 9222);
  const vault = flag("vault");
  const sectionArg = flag("section");

  const sections = sectionArg ? SECTIONS.filter((s) => s.key === sectionArg) : SECTIONS;
  if (sections.length === 0) {
    throw new Error(`Unbekannter --section ${sectionArg}. Bekannt: ${SECTIONS.map((s) => s.key).join(", ")}`);
  }

  console.log(`GUI-Smoke — Obsidian auf Port ${port}`);

  // macOS: `Page.bringToFront` holt das Fenster innerhalb der App nach vorn, nicht die App
  // nach vorn. Ohne beides drosselt Chromium den Renderer und der DOM misst nichts.
  if (process.platform === "darwin") {
    try {
      execFileSync("osascript", ["-e", 'tell application "Obsidian" to activate']);
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch {
      console.log("  (Hinweis: `osascript activate` schlug fehl — Fenster ggf. von Hand nach vorn holen)");
    }
  }

  const cdp = await attachTo("workspace", port, vault);
  if (!cdp) {
    throw new Error(
      `Kein Obsidian-Fenster mit Workspace auf Port ${port}${vault ? ` (Vault "${vault}")` : ""}. `
      + "Läuft Obsidian mit `--remote-debugging-port`?",
    );
  }

  // Läuft dieser Lauf gegen den eigenen Stand? `manifest.version` ist dafür strukturell
  // blind: Store-Build und Repo-Build tragen dieselbe Nummer — ein veralteter eigener Deploy
  // erst recht. Genau das ist am 2026-08-28 passiert: die beiden Workout-Prüfpunkte meldeten
  // rot gegen eine `main.js` vom 18.08. (0.6.0-Stand), die `.ah-workout-total` und die beiden
  // Wert-Spans noch gar nicht kannte — das Feature kam einen Tag später mit Slice 5. Die
  // Punkte hatten recht, der Prüfling war der falsche.
  //
  // Der Pfad kommt aus der LAUFENDEN Instanz, nicht aus `stagingVaultDir()`: ein Treiber
  // dockt per `--vault` an jedes Fenster an, und geprüft wird, was gemessen wird.
  //
  // Steht VOR dem try, also bevor irgendein Zustand angefasst wird (data.json-Schnappschuss,
  // Sidebars, Theme) — ein Abbruch hier hinterlässt nichts zum Aufräumen.
  const ort = await cdp.evaluate<{ basePath: string; configDir: string }>(`
    return { basePath: app.vault.adapter.basePath, configDir: app.vault.configDir };
  `);
  requireEigenerBuild(
    join(ort.basePath, ort.configDir, "plugins", PLUGIN_ID, "main.js"),
    // Der zweite Pfad ist hier nicht optional, sondern der ganze Punkt: ohne ihn bliebe nur
    // das `nosourcemap`-Suffix als Indiz — und das FEHLTE im Anlassfall, weil der Build kein
    // Store-Download war, sondern ein alter `npm run deploy`. Einarmig hätte der Guard
    // `ungeklaert` gewarnt und den Fehllauf durchgelassen.
    // Setzt voraus, dass `main.js` frisch gebaut ist (`npm run deploy` tut beides); `cwd`
    // ist das Repo-Root, weil npm-Scripts dort laufen und das Bundle dort abgelegt wird.
    join(process.cwd(), "main.js"),
  );

  // Ausserhalb des try, damit das `finally` beides auch nach einem Abbruch mitten im Lauf
  // zurückgibt: die Datei des Plugins UND die Body-Klassen des Themes.
  let dataVorher: string | null = null;
  let dataPfad: string | null = null;
  let warOffen = false;
  let sidebarsVorher: { links: boolean; rechts: boolean } | null = null;

  try {
    // Fokus-Emulation: bei mehreren offenen Fenstern bekommt unseres den echten
    // Tastaturfokus oft nicht; Chromium kann ihn dem Renderer vorspielen und die
    // Hintergrund-Drosselung entfällt, ohne fremde Fenster anzufassen.
    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
    await requireVisible(cdp);

    // Der eigene Fehlerkanal des Prüflings — ohne Mitschnitt meldet der Treiber
    // „Sektion fehlt", während die Ursache ungelesen daneben steht.
    const rendererFehler: string[] = [];
    await cdp.mitschnitt((zeile) => {
      if (/error|exception/i.test(zeile)) rendererFehler.push(zeile);
    });

    const vaultName = await cdp.evaluate<string>(`return app.vault.getName() ?? "";`);
    if (!vaultName) throw new Error("Obsidians `app` ist im Renderer nicht erreichbar.");
    console.log(`Vault: ${vaultName}\n`);

    // VOR dem Reload fragen, nicht danach: Der Reload räumt die Dashboard-Blätter selbst
    // ab, und ein danach gestelltes „war eins offen?" antwortet immer mit nein — der Lauf
    // schlösse am Ende ein Dashboard, das der Nutzer offen hatte.
    warOffen = await cdp.evaluate<boolean>(
      `return app.workspace.getLeavesOfType(${JSON.stringify(VIEW_TYPE)}).length > 0;`,
    );

    // Das Plugin NEU LADEN, bevor irgendetwas gemessen wird: `npm run deploy` ersetzt nur
    // Dateien, die laufende Instanz behält den alten Code im Speicher. Ohne diesen Schritt
    // misst der Smoke den zuletzt geladenen Stand und meldet ihn als Ergebnis für den
    // gerade gebauten.
    const plugin = await cdp.evaluate<{ ok: boolean; version?: string; dir?: string }>(`
      const id = ${JSON.stringify(PLUGIN_ID)};
      // Die Dashboard-Leaf aus einem früheren Lauf überlebt den Reload mit einer
      // View-Instanz aus dem ALTEN Code — sie sieht richtig aus, hängt aber an nichts mehr.
      app.workspace.detachLeavesOfType(${JSON.stringify(VIEW_TYPE)});
      if (app.plugins.plugins[id]) {
        await app.plugins.disablePlugin(id);
        await new Promise((r) => setTimeout(r, 400));
      }
      await app.plugins.enablePlugin(id);
      await new Promise((r) => setTimeout(r, 1000));
      const p = app.plugins.plugins[id];
      return p ? { ok: true, version: p.manifest.version, dir: p.manifest.dir } : { ok: false };
    `);
    if (!plugin.ok) throw new Error(`Plugin ${PLUGIN_ID} ist nicht aktiv. Erst \`npm run deploy\`.`);
    console.log(`Plugin-Version im Vault: ${plugin.version}`);

    // Schnappschuss der data.json als GANZES statt einzelner Felder: Der Lauf klappt die
    // Werte-Sektion auf, und diese Wiederherstellung darf nicht daran hängen, dass jeder
    // Abschnitt sauber zu Ende läuft. Der Vault gehört dem Maintainer, nicht dem Smoke.
    dataPfad = `${plugin.dir ?? ""}/data.json`;
    dataVorher = await cdp.evaluate<string | null>(`
      const pfad = ${JSON.stringify(dataPfad)};
      return (await app.vault.adapter.exists(pfad)) ? await app.vault.adapter.read(pfad) : null;
    `);

    const themeInfo = await cdp.evaluate<{ dunkel: boolean; name: string }>(`
      return {
        dunkel: document.body.classList.contains("theme-dark"),
        name: app.customCss?.theme || "(Standard)",
      };
    `);
    themeWarDunkel = themeInfo.dunkel;
    themeName = themeInfo.name;
    console.log(`Theme beim Start: ${themeName}, ${themeWarDunkel ? "dunkel" : "hell"}`);

    sidebarsVorher = await klappeSidebarsEin(cdp);
    const szene = await oeffneDashboard(cdp);
    console.log(`Ansichtsbreite: ${szene.breite}px\n`);
    if (!szene.hatCache) {
      throw new Error(
        "Das Dashboard zeigt den Import-Screen — ohne `health-cache.json` gibt es keine Tabs "
        + "und jeder Prüfpunkt wäre rot, ohne dass am Plugin etwas fehlt. Erst im Vault "
        + "einen Export importieren.",
      );
    }
    // Nur ein Blatt im Hauptbereich: ein zweites, in dem noch eine ältere Dashboard-Instanz
    // steht, macht `document.querySelector` mehrdeutig — und die Messung misst dann das
    // falsche Chart.
    await closeExtraLeaves(cdp);
    await pollUntil<boolean>(cdp, `return Boolean(document.querySelector(".ah-dashboard .ah-tabbar"));`, 10_000);

    for (const section of sections) {
      console.log(`── ${section.title}`);
      await section.run(cdp);
      console.log("");
    }

    if (rendererFehler.length > 0) {
      console.log("Renderer meldete während des Laufs:");
      for (const zeile of rendererFehler.slice(0, 10)) console.log(`  ! ${zeile}`);
      console.log("");
    }
  } finally {
    // Aufräumen darf nie am Ergebnis hängen: auch ein abgebrochener Lauf gibt den Vault so
    // zurück, wie er ihn vorgefunden hat. Das Theme-CSS zuerst — bricht der Lauf mitten in
    // der Gegenprobe ab, sitzt der Nutzer sonst vor einem Obsidian ohne sein Theme.
    await setzeThemeCss(cdp, true).catch(() => undefined);
    await setzeTheme(cdp, themeWarDunkel).catch(() => undefined);
    if (sidebarsVorher !== null) {
      await stelleSidebarsWiederHer(cdp, sidebarsVorher).catch(() => undefined);
    }

    if (dataVorher !== null && dataPfad !== null) {
      // Zurückschreiben UND das Plugin die Datei neu einlesen lassen: Es hält seine Daten
      // im Speicher und schriebe beim nächsten eigenen `saveData` den Smoke-Zustand
      // wieder über die gerade wiederhergestellte Datei.
      const wieder = await cdp
        .evaluate<string>(`
          const pfad = ${JSON.stringify(dataPfad)};
          await app.vault.adapter.write(pfad, ${JSON.stringify(dataVorher)});
          await app.plugins.plugins[${JSON.stringify(PLUGIN_ID)}]?.loadPluginData?.();
          return await app.vault.adapter.read(pfad);
        `)
        .catch(() => null);
      // Das Ergebnis gehört ins Protokoll, nicht ins Vertrauen.
      console.log(
        wieder === dataVorher
          ? "data.json: byte-gleich wiederhergestellt"
          : `data.json: ABWEICHUNG — bitte prüfen (${dataPfad})`,
      );
    }

    if (!warOffen) {
      await cdp
        .evaluate(`app.workspace.detachLeavesOfType(${JSON.stringify(VIEW_TYPE)}); return true;`)
        .catch(() => undefined);
    }
    cdp.close();
  }

  const failed = results.filter((check) => !check.passed);
  console.log(`\n${results.length - failed.length}/${results.length} grün`);
  if (failed.length > 0) {
    console.log("Rot:");
    for (const check of failed) console.log(`  - ${check.name}: ${check.detail}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\nAbbruch: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
