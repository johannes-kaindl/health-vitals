import { MarkdownRenderChild, type Plugin } from "obsidian";
import { parseBlockSpec, resolveMetricId, type BlockProblem } from "../core/block-spec";
import type { HealthCache } from "../core/types";
import { buildDetailVM, type DetailVM } from "../core/view-model";
import { t } from "../i18n/strings";
import { renderChart } from "./chart-render";
import { renderValuesTable } from "./tabs/detail";

export const BLOCK_LANGUAGE = "health-vitals";
const BLOCK_DIMS = { width: 640, height: 220, padding: 24 };

export interface CacheRead { cache: HealthCache | null; state: "ok" | "missing" | "outdated" }

/** Was ein Block vom Plugin braucht. */
export interface BlockHost {
  readCache(): Promise<CacheRead>;
  /** Meldet einen Rückruf für „der Cache hat sich geändert" an; liefert die Abmeldung. */
  onCacheChanged(cb: () => void): () => void;
}

export function registerHealthBlock(plugin: Plugin, host: BlockHost): void {
  plugin.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (source, el, ctx) => {
    ctx.addChild(new HealthBlock(el, source, host));
  });
}

/** Ein Block in einer Notiz. Rendert beim Laden und neu, sobald ein Import den Cache ändert. */
export class HealthBlock extends MarkdownRenderChild {
  private unsubscribe: (() => void) | null = null;
  private generation = 0;

  constructor(
    private readonly box: HTMLElement,
    private readonly source: string,
    private readonly host: BlockHost,
  ) {
    super(box);
  }

  onload(): void {
    this.unsubscribe = this.host.onCacheChanged(() => { void this.render(); });
    void this.render();
  }

  onunload(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async render(): Promise<void> {
    // Zwei Renders können sich überholen (Import fertig, während der erste noch liest): nur der
    // jüngste zeichnet.
    const mine = ++this.generation;
    const read = await this.host.readCache();
    if (mine !== this.generation) return;
    this.box.empty();
    this.box.addClass("ah-block");

    const parsed = parseBlockSpec(this.source);
    for (const p of parsed.errors) this.message(p, "error");
    if (!parsed.spec) return;
    for (const p of parsed.warnings) this.message(p, "warn");

    if (!read.cache) {
      this.message({ key: read.state === "outdated" ? "block.cacheOutdated" : "block.noCache", args: [] }, "error");
      return;
    }
    const id = resolveMetricId(read.cache, parsed.spec.metric);
    if (id === null) {
      this.message({ key: "block.unknownMetric", args: [parsed.spec.metric] }, "error");
      return;
    }
    const vm = buildDetailVM(read.cache, id, parsed.spec.range, BLOCK_DIMS, { granularity: parsed.spec.rollup });
    if (vm.empty) {
      this.message({ key: "block.noData", args: [vm.name] }, "error");
      return;
    }
    this.draw(vm, parsed.spec.kind);
  }

  private draw(vm: DetailVM, kind: "chart" | "value" | "table"): void {
    const head = this.box.createDiv({ cls: "ah-detail-head" });
    head.createEl("strong", { text: vm.name });
    if (vm.rangeLabel) head.createSpan({ cls: "ah-detail-range", text: vm.rangeLabel });
    if (kind === "chart") {
      renderChart(this.box.createDiv({ cls: "ah-detail-chart" }), vm.chart, { axis: vm.axis });
    }
    if (kind === "table") {
      renderValuesTable(this.box, vm.table);
      return;
    }
    const stats = this.box.createDiv({ cls: "ah-stat-row" });
    for (const row of vm.stats) {
      const cell = stats.createDiv({ cls: "ah-stat-cell" });
      cell.createSpan({ cls: "ah-stat-label", text: row.label });
      cell.createSpan({ cls: "ah-stat-value", text: row.value });
    }
  }

  private message(p: BlockProblem, level: "error" | "warn"): void {
    this.box.createDiv({ cls: `ah-block-msg is-${level}`, text: t(p.key, ...p.args) });
  }
}
