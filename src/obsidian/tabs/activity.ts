import type { ActivityVM, RingVM } from "../../core/view-model";
import { t } from "../../vendor/kit/i18n";

const SIZE = 72;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Aktivitätsringe des jüngsten Tages plus Zielerreichung. Der Bogen ist nur eine der Aussagen:
 *  Wert, Ziel und Prozent stehen als Text daneben, und der Ring trägt einen Namen für
 *  Screenreader — Farbe und Bogen allein wären ein einziger Kanal. */
export function renderActivityRings(parent: HTMLElement, vm: ActivityVM): void {
  const card = parent.createDiv({ cls: "ah-rings" });
  const head = card.createDiv({ cls: "ah-rings-head" });
  head.createEl("h3", { text: t("ring.title") });
  head.createSpan({ cls: "ah-detail-range", text: t("ring.day", vm.day) });

  const row = card.createDiv({ cls: "ah-rings-row" });
  for (const r of vm.rings) renderRing(row, r);

  card.createDiv({ cls: "ah-rings-reached", text: t("ring.reached", vm.reachedDays, vm.windowDays) });
}

function renderRing(row: HTMLElement, r: RingVM): void {
  const cell = row.createDiv({ cls: `ah-ring ah-ring-${r.id}${r.closed ? " is-closed" : ""}` });
  const svg = cell.createSvg("svg", {
    cls: "ah-ring-svg",
    attr: {
      viewBox: `0 0 ${SIZE} ${SIZE}`, width: SIZE, height: SIZE, role: "img",
      "aria-label": t("ring.aria", r.label, r.value, r.goal, r.percent),
    },
  });
  const c = SIZE / 2;
  svg.createSvg("circle", { cls: "ah-ring-track", attr: { cx: c, cy: c, r: RADIUS, "stroke-width": STROKE, fill: "none" } });
  svg.createSvg("circle", {
    cls: "ah-ring-arc",
    attr: {
      cx: c, cy: c, r: RADIUS, "stroke-width": STROKE, fill: "none", "stroke-linecap": "round",
      "stroke-dasharray": `${(r.fraction * CIRCUMFERENCE).toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`,
      transform: `rotate(-90 ${c} ${c})`,
    },
  });
  cell.createDiv({ cls: "ah-ring-label", text: r.label });
  cell.createDiv({ cls: "ah-ring-value", text: r.value });
  cell.createDiv({ cls: "ah-ring-goal", text: `${t("ring.goalOf", r.goal)} · ${r.percent}%` });
}
