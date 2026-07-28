import type { ChartGeometry } from "../core/chart-geometry";
import type { AxisVM } from "../core/view-model";

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
