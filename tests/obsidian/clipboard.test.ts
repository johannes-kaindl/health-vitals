import { copyToClipboard } from "../../src/obsidian/clipboard";

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
