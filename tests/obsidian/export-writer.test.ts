import { writeExport } from "../../src/obsidian/export-writer";

function fakeApp(existing: string[] = []) {
  const written: Array<[string, string]> = [];
  const dirs: string[] = [];
  const app: any = {
    vault: {
      adapter: {
        exists: (p: string) => Promise.resolve(existing.includes(p)),
        mkdir: (p: string) => { dirs.push(p); return Promise.resolve(); },
        write: (p: string, c: string) => { written.push([p, c]); return Promise.resolve(); },
      },
    },
  };
  return { app, written, dirs };
}

describe("writeExport", () => {
  it("schreibt in den freien Pfad und gibt ihn zurück", async () => {
    const { app, written } = fakeApp();
    const path = await writeExport(app, "30_Health", "Ruhepuls 2026-07", "md", "inhalt");
    expect(path).toBe("30_Health/Ruhepuls 2026-07.md");
    expect(written).toEqual([["30_Health/Ruhepuls 2026-07.md", "inhalt"]]);
  });

  it("belegter Pfad → Suffix zählt hoch, bestehende Datei bleibt unangetastet", async () => {
    const { app, written } = fakeApp(["30_Health", "30_Health/A.md", "30_Health/A 2.md"]);
    const path = await writeExport(app, "30_Health", "A", "md", "neu");
    expect(path).toBe("30_Health/A 3.md");
    expect(written.map((w) => w[0])).toEqual(["30_Health/A 3.md"]);
  });

  it("fehlender Ordner wird angelegt", async () => {
    const { app, dirs } = fakeApp();
    await writeExport(app, "30_Health/Exporte", "A", "csv", "x");
    expect(dirs).toEqual(["30_Health/Exporte"]);
  });

  it("vorhandener Ordner wird nicht erneut angelegt", async () => {
    const { app, dirs } = fakeApp(["30_Health"]);
    await writeExport(app, "30_Health", "A", "csv", "x");
    expect(dirs).toEqual([]);
  });

  it("leerer Ordner bedeutet Vault-Wurzel, ohne mkdir", async () => {
    const { app, dirs, written } = fakeApp();
    const path = await writeExport(app, "", "A", "md", "x");
    expect(path).toBe("A.md");
    expect(dirs).toEqual([]);
    expect(written).toHaveLength(1);
  });

  it("Sonderzeichen im Basename werden gesäubert", async () => {
    const { app } = fakeApp();
    const path = await writeExport(app, "", "A/B", "md", "x");
    expect(path).toBe("AB.md");
  });
});
