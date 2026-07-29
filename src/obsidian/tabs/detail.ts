import { Notice } from "obsidian";
import type { HealthCache } from "../../core/types";
import type { RangeKey } from "../../core/rollup";
import type { DetailVM, TableVM } from "../../core/view-model";
import { buildDetailVM } from "../../core/view-model";
import { renderChart } from "../chart-render";
import type { DashboardView, ExportFormat } from "../dashboard-view";
import { collapsibleSection } from "../../vendor/kit-obsidian/collapsible";
import { t } from "../../vendor/kit/i18n";
import { toCsv, toMarkdownTable } from "../../core/serialize";
import { buildExportName } from "../../core/export-path";
import { copyToClipboard, flashCopied } from "../clipboard";
import { writeExport } from "../export-writer";
import { FolderSuggest } from "../../vendor/kit-obsidian/folder-suggest";

export interface DetailState { metricId: string | null; range: RangeKey; }

const RANGES: RangeKey[] = ["1M", "3M", "1Y", "all"];
const CHART_DIMS = { width: 640, height: 260, padding: 24 };
const VALUES_KEY = "detail-values";

export function renderDetail(
  el: HTMLElement, cache: HealthCache, state: DetailState, onState: (s: DetailState) => void,
  view: DashboardView,
): void {
  if (!state.metricId) {
    const hint = el.createDiv({ cls: "ah-detail-hint" });
    hint.createSpan({ text: t("detail.pickMetric") });
    return;
  }
  const vm = buildDetailVM(cache, state.metricId, state.range, CHART_DIMS);

  const head = el.createDiv({ cls: "ah-detail-head" });
  head.createEl("h2", { text: vm.name });
  if (vm.rangeLabel) head.createSpan({ cls: "ah-detail-range", text: vm.rangeLabel });

  const tabs = el.createDiv({ cls: "ah-range-bar" });
  for (const rk of RANGES) {
    const btn = tabs.createEl("button", { text: t("range." + rk) });
    btn.addClass("ah-range-btn");
    if (rk === state.range) btn.addClass("is-active");
    btn.addEventListener("click", () => onState({ metricId: state.metricId, range: rk }));
  }

  if (vm.empty) {
    const hint = el.createDiv({ cls: "ah-detail-hint" });
    hint.createSpan({ text: t("detail.noData") });
  } else {
    const chartBox = el.createDiv({ cls: "ah-detail-chart" });
    renderChart(chartBox, vm.chart, { axis: vm.axis });
  }

  const stats = el.createDiv({ cls: "ah-stat-row" });
  for (const row of vm.stats) {
    const cell = stats.createDiv({ cls: "ah-stat-cell" });
    cell.createSpan({ cls: "ah-stat-label", text: row.label });
    cell.createSpan({ cls: "ah-stat-value", text: row.value });
  }

  // Kein Export von nichts: ohne Punkte im Zeitraum entfällt die Sektion ganz.
  if (!vm.empty) renderValuesSection(el, vm, view);
}

function renderValuesSection(el: HTMLElement, vm: DetailVM, view: DashboardView): void {
  const body = collapsibleSection(el, {
    title: `${t("table.title")} (${vm.table.rows.length})`,
    key: VALUES_KEY,
    defaultCollapsed: true,
    storage: view.host,
  });
  renderExportRow(body, vm, view);
  renderValuesTable(body, vm.table);
}

const FORMATS: Array<{ id: ExportFormat; label: string }> = [
  { id: "md", label: "MD" },
  { id: "csv", label: "CSV" },
];

function serializeTable(vm: DetailVM, format: ExportFormat): string {
  return format === "csv"
    ? toCsv(vm.table.headers, vm.table.rowsRaw)
    : toMarkdownTable(vm.table.headers, vm.table.rows);
}

function renderExportRow(parent: HTMLElement, vm: DetailVM, view: DashboardView): void {
  const host = view.host;
  const row = parent.createDiv({ cls: "ah-export-row" });

  const copyBtn = row.createEl("button", { cls: "mod-cta ah-copy-btn", text: t("export.copy") });
  copyBtn.addEventListener("click", () => {
    const text = serializeTable(vm, host.getExportFormat());
    // Quittung am Knopf statt als Notice. Wieviel kopiert wurde, steht unverändert im
    // Sektionstitel („Werte (N)") direkt darüber — ein zweites Signal dafür wäre Rauschen.
    copyToClipboard(text, () => { flashCopied(copyBtn, t("export.copied"), t("export.copy")); });
  });

  const saveBtn = row.createEl("button", { text: t("export.save") });
  saveBtn.addEventListener("click", () => { void save(); });

  const formatBar = row.createDiv({ cls: "ah-range-bar" });
  for (const f of FORMATS) {
    const btn = formatBar.createEl("button", { text: f.label });
    btn.addClass("ah-range-btn");
    if (f.id === host.getExportFormat()) btn.addClass("is-active");
    btn.addEventListener("click", () => {
      host.setExportFormat(f.id);
      // Nur die Markierung umhängen statt neu zu rendern: ein Re-Render würde
      // den Fokus aus dem Ordner-Feld reißen, während man noch tippt.
      for (const el of Array.from(formatBar.children)) el.removeClass("is-active");
      btn.addClass("is-active");
    });
  }

  const folderRow = parent.createDiv({ cls: "ah-export-folder" });
  folderRow.createSpan({ cls: "ah-export-label", text: t("export.folder") });
  const input = folderRow.createEl("input", { attr: { type: "text", placeholder: "/" } });
  input.value = host.getExportFolder();
  new FolderSuggest(view.app, input);
  // Gespeichert wird beim Verlassen des Feldes, nicht bei jedem Tastenanschlag: Jeder
  // Setter schreibt data.json als Ganzes und unawaited weg — ein 17-Zeichen-Pfad löste
  // damit 17 nebenläufige Schreibvorgänge aus, deren Abschlussreihenfolge nicht garantiert
  // ist; gewinnt ein früherer, bleibt ein abgeschnittenes Präfix gespeichert.
  // "change" deckt Enter und Fokusverlust ab, "blur" zusätzlich den Weg über die
  // Suggest-Auswahl per Maus.
  const persistFolder = (): void => { host.setExportFolder(input.value); };
  input.addEventListener("change", persistFolder);
  input.addEventListener("blur", persistFolder);

  async function save(): Promise<void> {
    // Zwei schnelle Klicks lösen sonst parallel dieselbe Kollisionssuche in writeExport
    // aus, finden denselben freien Pfad und der zweite Lauf überschreibt den ersten —
    // "es wird nie überschrieben" gilt gegen Bestandsdateien, nicht gegen sich selbst.
    if (saveBtn.disabled) return;
    saveBtn.disabled = true;
    // Der Ordner kommt aus dem Feld, nicht aus dem Speicher: Wer tippt und sofort auf
    // Speichern klickt, hat den Wert noch nicht persistiert — gelten soll er trotzdem.
    const folder = input.value;
    persistFolder();
    const format = host.getExportFormat();
    const from = vm.table.rows[0]?.[0] ?? "";
    const to = vm.table.rows[vm.table.rows.length - 1]?.[0] ?? "";
    try {
      const path = await writeExport(
        view.app, folder, buildExportName(vm.name, from, to),
        format, serializeTable(vm, format),
      );
      new Notice(t("export.saved", path));
    } catch (err) {
      new Notice(t("export.saveFailed", err instanceof Error ? err.message : String(err)));
    } finally {
      saveBtn.disabled = false;
    }
  }
}

function renderValuesTable(parent: HTMLElement, table: TableVM): void {
  const wrap = parent.createDiv({ cls: "ah-table-wrap" });
  const el = wrap.createEl("table", { cls: "ah-table" });
  const headRow = el.createEl("thead").createEl("tr");
  for (const h of table.headers) headRow.createEl("th", { text: h });
  const tbody = el.createEl("tbody");
  for (const row of table.rows) {
    const tr = tbody.createEl("tr");
    for (const cell of row) tr.createEl("td", { text: cell });
  }
}
