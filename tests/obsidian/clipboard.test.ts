import { copyToClipboard, flashCopied } from "../../src/obsidian/clipboard";

describe("copyToClipboard", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("ohne navigator.clipboard: kein Throw, kein Callback", () => {
    vi.stubGlobal("navigator", {});
    const onCopied = vi.fn();
    expect(() => copyToClipboard("x", onCopied)).not.toThrow();
    expect(onCopied).not.toHaveBeenCalled();
  });

  it("Erfolg ruft den Callback mit dem übergebenen Text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();
    copyToClipboard("hallo", onCopied);
    await vi.waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1));
    expect(writeText).toHaveBeenCalledWith("hallo");
  });

  it("abgelehntes writeText schlägt nicht durch", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onCopied = vi.fn();
    expect(() => copyToClipboard("x", onCopied)).not.toThrow();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(onCopied).not.toHaveBeenCalled();
  });
});

function fakeButton(): any {
  return {
    text: "", classes: new Set<string>(),
    setText(v: string) { this.text = v; },
    addClass(c: string) { this.classes.add(c); },
    removeClass(c: string) { this.classes.delete(c); },
  };
}

describe("flashCopied", () => {
  // `window` kommt aus tests/setup.ts und delegiert zur Aufrufzeit an die globalen Timer —
  // useFakeTimers wirkt dadurch auch auf window.setTimeout, ohne Stub an dieser Stelle.
  // Genau diese Datei hatte den Stub vorher lokal, und genau das verdeckte, dass jede
  // ANDERE Testdatei ohne ihn in flashCopied auf ein fehlendes `window` läuft.
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("setzt die Quittung und nimmt sie nach 800 ms zurück", () => {
    const btn = fakeButton();
    flashCopied(btn, "Kopiert", "Kopieren");
    expect(btn.text).toBe("Kopiert");
    expect(btn.classes.has("is-copied")).toBe(true);

    vi.advanceTimersByTime(799);
    expect(btn.text).toBe("Kopiert");
    vi.advanceTimersByTime(1);
    expect(btn.text).toBe("Kopieren");
    expect(btn.classes.has("is-copied")).toBe(false);
  });

  it("ein zweiter Klick verlängert die Quittung, statt sie zu früh zu beenden", () => {
    const btn = fakeButton();
    flashCopied(btn, "Kopiert", "Kopieren");
    vi.advanceTimersByTime(700);
    flashCopied(btn, "Kopiert", "Kopieren"); // erneut geklickt, kurz vor Ablauf
    vi.advanceTimersByTime(200);             // der ERSTE Timer wäre hier fällig gewesen
    expect(btn.text).toBe("Kopiert");
    vi.advanceTimersByTime(600);
    expect(btn.text).toBe("Kopieren");
  });

  it("zwei Knöpfe stören einander nicht", () => {
    const a = fakeButton(), b = fakeButton();
    flashCopied(a, "Kopiert", "Kopieren");
    vi.advanceTimersByTime(400);
    flashCopied(b, "Kopiert", "Kopieren");
    vi.advanceTimersByTime(400);
    expect(a.text).toBe("Kopieren"); // Timer von a abgelaufen
    expect(b.text).toBe("Kopiert");  // Timer von b läuft noch
  });
});
