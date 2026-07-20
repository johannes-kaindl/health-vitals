import type { WorkspaceLeaf } from "obsidian";
import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "../../src/obsidian/dashboard-view";
import type { HealthCache } from "../../src/core/types";
import type { ImportState } from "../../src/core/import-state";
import type { ImportController } from "../../src/obsidian/import-controller";

// Reicht nicht als eine echte WorkspaceLeaf durch (ItemView nutzt sie nur für
// this.leaf) — vermeidet ein literales `any` (per unknown statt any gecastet),
// das @typescript-eslint/no-explicit-any sonst melden würde.
function fakeLeaf(): WorkspaceLeaf { return {} as unknown as WorkspaceLeaf; }

// Zugriff auf private Member (startImport, importState) für Tests, die den
// öffentlichen DOM-Klickpfad mangels DOM-Mock nicht auslösen können — ebenfalls
// über `unknown` statt eines literalen `any` gecastet.
type TestableView = DashboardView & { startImport(): Promise<void>; importState: ImportState };
function privates(v: DashboardView): TestableView { return v as unknown as TestableView; }

function host(cache: HealthCache | null, overrides: Partial<DashboardHost> = {}): DashboardHost {
  return {
    loadCache: async () => cache,
    getFavorites: () => [],
    toggleFavorite: async () => {},
    createImportController: (_onState: (s: ImportState) => void) => ({}) as ImportController,
    pickExport: async () => null,
    ...overrides,
  };
}
const emptyCache: HealthCache = {
  version: 1, sourceFile: "", importedAt: "", recordCount: 0, skippedCount: 0,
  dateRange: { from: "2026-01-01", to: "2026-01-02" }, metrics: {}, workouts: [],
};

describe("DashboardView", () => {
  it("getViewType/getDisplayText gesetzt", () => {
    const v = new DashboardView(fakeLeaf(), host(emptyCache));
    expect(v.getViewType()).toBe(VIEW_TYPE_DASHBOARD);
    expect(v.getDisplayText().length).toBeGreaterThan(0);
  });

  it("onOpen ohne Cache rendert Import-Screen-CTA (fordert den Export nicht von selbst an)", async () => {
    let picked = false;
    const v = new DashboardView(
      fakeLeaf(),
      host(null, { pickExport: async () => { picked = true; return null; } }),
    );
    await v.onOpen();
    expect(picked).toBe(false); // CTA nur vorhanden, nicht auto-getriggert
  });

  it("onOpen mit Cache wirft nicht", async () => {
    const v = new DashboardView(fakeLeaf(), host(emptyCache));
    await expect(v.onOpen()).resolves.toBeUndefined();
  });

  // Ohne das würde ein laufender Import nach dem Schließen der View gegen ein
  // losgelöstes DOM weiterparsen — ein Wiedereröffnen könnte dann einen zweiten,
  // parallelen Import auf denselben Cache-Pfad starten (Review Fix 3).
  it("onClose bricht einen laufenden Import ab", async () => {
    let abortCalled = false;
    const fakeCtrl = {
      start: () => new Promise<void>(() => {}), // hängt bewusst — simuliert einen laufenden Import
      abort: () => { abortCalled = true; },
    } as unknown as ImportController;
    const v = new DashboardView(
      fakeLeaf(),
      host(null, {
        pickExport: async () => new File([], "Export.xml"),
        createImportController: () => fakeCtrl,
      }),
    );
    await v.onOpen();
    void privates(v).startImport();
    await Promise.resolve();
    await Promise.resolve();

    await v.onClose();

    expect(abortCalled).toBe(true);
  });

  // Der vorherige Controller kann nach dem Start eines neuen Imports noch einen
  // letzten (verspäteten) Zustand emittieren — z.B. das finale "aborted" aus seinem
  // catch-Block. Dieser darf den bereits laufenden neuen Import nicht überschreiben
  // (Review Fix 7).
  it("ignoriert einen verspäteten Zustand vom vorherigen (überholten) Import-Controller", async () => {
    const capturedOnStates: Array<(s: ImportState) => void> = [];
    const v = new DashboardView(
      fakeLeaf(),
      host(null, {
        pickExport: async () => new File([], "Export.xml"),
        createImportController: (onState) => {
          capturedOnStates.push(onState);
          return { start: () => new Promise<void>(() => {}), abort: () => {} } as unknown as ImportController;
        },
      }),
    );
    await v.onOpen();

    void privates(v).startImport(); // Import #1 — Controller wird erzeugt, hängt in start()
    await Promise.resolve();
    await Promise.resolve();
    void privates(v).startImport(); // Import #2 — überholt #1, this.importCtrl zeigt jetzt auf #2
    await Promise.resolve();
    await Promise.resolve();

    expect(capturedOnStates.length).toBe(2);

    // Der überholte Controller #1 meldet verspätet "aborted" — muss verworfen werden.
    capturedOnStates[0]({ status: "aborted" });
    expect(privates(v).importState).not.toEqual({ status: "aborted" });

    // Der aktuelle Controller #2 meldet denselben Zustand — muss durchschlagen (Guard
    // blockiert nicht pauschal jeden Callback, nur den des überholten Controllers).
    capturedOnStates[1]({ status: "aborted" });
    expect(privates(v).importState).toEqual({ status: "aborted" });
  });
});
