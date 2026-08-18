import type { ChartGeometry } from "../core/chart-geometry";
import type { AxisVM, SleepStagesVM } from "../core/view-model";
import { formatDuration } from "../core/format";
import { t } from "../vendor/kit/i18n";

/**
 * Zeichnet das Chart. Drei Aufrufformen:
 *
 *   renderChart(el, geom)                    → nacktes <svg>, sonst nichts (Sparklines, Übersicht)
 *   renderChart(el, geom, { grid: true })    → <svg> + Gitterlinien (Workouts)
 *   renderChart(el, geom, { axis: vm.axis }) → Rahmen + Labels + Gitterlinien (Detail)
 *
 * Mit Achsendaten kommt ein Grid-Rahmen dazu:
 *
 *   ┌──────────┬──────────────┐
 *   │ y-Labels │  <svg>       │
 *   ├──────────┼──────────────┤
 *   │          │  x-Labels    │
 *   └──────────┴──────────────┘
 *
 * Die Labels sind bewusst HTML und kein SVG-<text>: Das SVG skaliert über
 * width:100%, eine Schriftgröße in viewBox-Einheiten schrumpfte in einer
 * schmalen Sidebar auf wenige Pixel. Als HTML tragen sie --font-ui-smaller
 * und bleiben in jeder Containerbreite lesbar.
 *
 * `grid` und `axis` sind unabhängig voneinander wählbar, `axis` bringt die
 * Gitterlinien aber immer mit — die Entscheidung, ob überhaupt Gitterlinien
 * entstehen, fällt genau einmal in `showGrid`, nicht dupliziert an jeder Stelle.
 * Wochenlinien bleiben ausschließlich dem Achsen-Fall vorbehalten: sie gehören
 * fachlich zur Detail-Ansicht, nicht zu jedem beliebigen Grid.
 */
export function renderChart(
  parent: HTMLElement, geom: ChartGeometry, opts?: { axis?: AxisVM; grid?: boolean },
): void {
  const axis = opts?.axis;
  const showGrid = Boolean(axis) || Boolean(opts?.grid);
  const host = axis ? parent.createDiv({ cls: "ah-chart-frame" }) : parent;

  if (axis) {
    const yCol = host.createDiv({ cls: "ah-axis-y" });
    // Die Spaltenbreite ist fix per CSS nicht darstellbar: Die Labels sitzen
    // `position: absolute`, tragen also nichts zur automatischen Breite der
    // Grid-Spalte bei (out-of-flow-Elemente werden von jeder Shrink-to-fit-
    // Berechnung ausgenommen). Ohne diese Zeile bräuchte es eine feste ch-Zahl
    // in styles.css — die schneidet dann bei jedem längeren Wert wieder ab
    // (siehe I-2). Stattdessen hier je Render an die tatsächlich längste
    // Beschriftung angepasst, funktioniert also für beliebig viele Stellen.
    const maxLen = axis.y.reduce((m, tick) => Math.max(m, tick.label.length), 0);
    if (maxLen > 0) yCol.setCssStyles({ width: `${maxLen}ch` });
    for (const tick of axis.y) {
      const label = yCol.createSpan({ cls: "ah-axis-label", text: tick.label });
      label.setCssStyles({ top: `${tick.topPct}%` });
    }
  }

  const svgHost = axis ? host.createDiv({ cls: "ah-chart-box" }) : host;
  const svg = svgHost.createSvg("svg", {
    cls: "ah-chart",
    attr: { viewBox: `0 0 ${geom.width} ${geom.height}`, preserveAspectRatio: "none" },
  });

  if (showGrid) {
    for (const tick of geom.yTicks) {
      svg.createSvg("line", {
        cls: "ah-chart-grid",
        attr: { x1: 0, y1: tick.y, x2: geom.width, y2: tick.y },
      });
    }
  }
  if (axis) {
    // Wochenlinien kommen aus der Geometrie (viewBox-Einheiten), nicht aus dem
    // AxisVM — sie werden im SVG gezeichnet, nicht im HTML-Layer. Sie gehören
    // an den Achsen-Fall, nicht an jedes Grid (Workouts-Chart hat keine Wochen).
    for (const x of geom.weekMarks) {
      svg.createSvg("line", {
        cls: "ah-chart-week",
        attr: { x1: x, y1: 0, x2: x, y2: geom.height },
      });
    }
  }

  if (geom.band) {
    svg.createSvg("polygon", { cls: "ah-chart-band", attr: { points: geom.band } });
  }
  if (geom.polyline) {
    svg.createSvg("polyline", { cls: "ah-chart-line", attr: { points: geom.polyline, fill: "none" } });
  }
  for (const b of geom.bars) {
    svg.createSvg("rect", {
      cls: "ah-chart-bar",
      attr: { x: b.x, y: b.y, width: b.w, height: b.h },
    });
  }

  if (axis) {
    host.createDiv({ cls: "ah-axis-corner" });
    const xRow = host.createDiv({ cls: "ah-axis-x" });
    for (const tick of axis.x) {
      const label = xRow.createSpan({ cls: "ah-axis-label", text: tick.label });
      label.setCssStyles({ left: `${tick.leftPct}%` });
    }
  }
}

/**
 * Das gestapelte Phasen-Chart. Baut denselben Rahmen wie `renderChart` im
 * Achsen-Fall (HTML-Labels neben dem SVG) und ergaenzt Legende und Hinweiszeile.
 *
 * Die Farbe traegt die Zuordnung nur mit: jedes Segment nennt Phase und Dauer in
 * einem `<title>`, das als Tooltip und fuer Screenreader lesbar ist (WCAG 1.4.1).
 */
export function renderStackChart(parent: HTMLElement, vm: SleepStagesVM): void {
  const host = parent.createDiv({ cls: "ah-chart-frame" });

  const yCol = host.createDiv({ cls: "ah-axis-y" });
  const maxLen = vm.axis.y.reduce((m, tick) => Math.max(m, tick.label.length), 0);
  if (maxLen > 0) yCol.setCssStyles({ width: `${maxLen}ch` });
  for (const tick of vm.axis.y) {
    const label = yCol.createSpan({ cls: "ah-axis-label", text: tick.label });
    label.setCssStyles({ top: `${tick.topPct}%` });
  }

  const svgHost = host.createDiv({ cls: "ah-chart-box" });
  const svg = svgHost.createSvg("svg", {
    cls: "ah-chart",
    attr: { viewBox: `0 0 ${vm.chart.width} ${vm.chart.height}`, preserveAspectRatio: "none" },
  });

  for (const tick of vm.chart.yTicks) {
    svg.createSvg("line", {
      cls: "ah-chart-grid",
      attr: { x1: 0, y1: tick.y, x2: vm.chart.width, y2: tick.y },
    });
  }
  for (const x of vm.chart.weekMarks) {
    svg.createSvg("line", {
      cls: "ah-chart-week",
      attr: { x1: x, y1: 0, x2: x, y2: vm.chart.height },
    });
  }

  const labelOf = new Map(vm.legend.map((l) => [l.stage, l.label]));
  for (const stack of vm.chart.stacks) {
    for (const seg of stack.segments) {
      const rect = svg.createSvg("rect", {
        // Mehrere Klassen als Array: `createSvg` setzt sie ueber `classList.add`, das
        // bei einem Leerzeichen im String wirft — anders als `createDiv`/`createEl`.
        cls: ["ah-chart-stack", `ah-stage-${seg.stage}`],
        attr: { x: seg.x, y: seg.y, width: seg.w, height: seg.h },
      });
      // `SvgElementInfo` kennt kein `text` — der Titel wird gesetzt, nicht deklariert.
      rect.createSvg("title").setText(
        t("sleep.segmentTooltip", labelOf.get(seg.stage) ?? seg.stage, formatDuration(seg.minutes)),
      );
    }
  }

  host.createDiv({ cls: "ah-axis-corner" });
  const xRow = host.createDiv({ cls: "ah-axis-x" });
  for (const tick of vm.axis.x) {
    const label = xRow.createSpan({ cls: "ah-axis-label", text: tick.label });
    label.setCssStyles({ left: `${tick.leftPct}%` });
  }

  const legend = parent.createDiv({ cls: "ah-legend" });
  for (const item of vm.legend) {
    const entry = legend.createDiv({ cls: "ah-legend-item" });
    entry.createSpan({ cls: `ah-legend-swatch ah-stage-${item.stage}` });
    entry.createSpan({ cls: "ah-legend-label", text: item.label });
  }

  if (vm.note) parent.createDiv({ cls: "ah-stage-note", text: vm.note });
}
