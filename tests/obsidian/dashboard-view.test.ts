import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "../../src/obsidian/dashboard-view";
import type { HealthCache } from "../../src/core/types";
import type { ImportState } from "../../src/core/import-state";
import type { ImportController } from "../../src/obsidian/import-controller";

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
    const v = new DashboardView({} as any, host(emptyCache));
    expect(v.getViewType()).toBe(VIEW_TYPE_DASHBOARD);
    expect(v.getDisplayText().length).toBeGreaterThan(0);
  });

  it("onOpen ohne Cache rendert Import-Screen-CTA (fordert den Export nicht von selbst an)", async () => {
    let picked = false;
    const v = new DashboardView(
      {} as any,
      host(null, { pickExport: async () => { picked = true; return null; } }),
    );
    await v.onOpen();
    expect(picked).toBe(false); // CTA nur vorhanden, nicht auto-getriggert
  });

  it("onOpen mit Cache wirft nicht", async () => {
    const v = new DashboardView({} as any, host(emptyCache));
    await expect(v.onOpen()).resolves.toBeUndefined();
  });
});
