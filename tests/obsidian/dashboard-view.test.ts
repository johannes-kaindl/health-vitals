import { DashboardView, VIEW_TYPE_DASHBOARD, type DashboardHost } from "../../src/obsidian/dashboard-view";
import type { HealthCache } from "../../src/core/types";

function host(cache: HealthCache | null): DashboardHost {
  return {
    loadCache: async () => cache,
    getFavorites: () => [],
    toggleFavorite: async () => {},
    runImport: () => {},
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

  it("onOpen ohne Cache rendert Empty-State-CTA (ruft runImport nicht von selbst)", async () => {
    let imported = false;
    const v = new DashboardView({} as any, { ...host(null), runImport: () => { imported = true; } });
    await v.onOpen();
    expect(imported).toBe(false); // CTA nur vorhanden, nicht auto-getriggert
  });

  it("onOpen mit Cache wirft nicht", async () => {
    const v = new DashboardView({} as any, host(emptyCache));
    await expect(v.onOpen()).resolves.toBeUndefined();
  });
});
