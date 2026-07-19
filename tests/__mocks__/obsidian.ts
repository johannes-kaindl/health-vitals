// Minimaler obsidian-Mock — lebt AUSSERHALB src/ (PROF-OBS-08), nur via vitest resolve.alias gezogen.
// Bei Bedarf um genutzte API-Stellen erweitern.
function makeEl(): any {
  const el: any = {
    style: {},
    children: [] as any[],
    empty() { el.children = []; },
    createEl(tag?: string, o?: any) {
      const child = makeEl();
      child.tag = tag;
      if (o && o.cls) child.cls = o.cls;
      if (o && o.text) { child.text = o.text; child.textContent = o.text; }
      el.children.push(child);
      return child;
    },
    createDiv(o?: any) { return el.createEl("div", o); },
    createSpan(o?: any) { return el.createEl("span", o); },
    replaceChildren() { el.children = []; },
    setText() {},
    addClass() {},
    removeClass() {},
    toggleClass(_cls: string, _value: boolean) {},
    setAttribute(_name: string, _value: string) {},
    addEventListener() {},
    removeEventListener() {},
    instanceOf(_type: any) { return true; }, // template stub: permissive so guards pass; refine per plugin
    createSvg(tag: string, o?: any) {
      const child = makeEl();
      child.tag = tag;
      child.attrs = (o && o.attr) || {};
      child.cls = (o && o.cls) || "";
      el.children.push(child);
      return child;
    },
  };
  return el;
}

export class Plugin {
  app: any;
  manifest: any;
  constructor(app?: any, manifest?: any) { this.app = app; this.manifest = manifest; }
  onload() {}
  onunload() {}
  addCommand() {}
  registerView() {}
  registerExtensions() {}
  addSettingTab() {}
  registerEvent() {}
  addRibbonIcon(_i: string, _t: string, _cb: any) { return makeEl(); }
  async loadData(): Promise<any> { return null; }
  async saveData(_d: any): Promise<void> {}
}

export class FileSystemAdapter { getBasePath() { return "/fake"; } }

export class PluginSettingTab {
  containerEl: any = makeEl();
  constructor(_app?: any, _plugin?: any) {}
  display() {}
}

export class Setting {
  constructor(_el?: any) {}
  setName() { return this; }
  setDesc() { return this; }
  setHeading() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addButton() { return this; }
}

export class Notice { constructor(_msg?: string) {} }

export class Modal {
  contentEl: any = makeEl();
  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export const Platform = { isMobile: false, isDesktopApp: true };

export function normalizePath(p: string): string { return p.replace(/\\/g, "/").replace(/\/+/g, "/"); }

export async function requestUrl(_opts: any): Promise<{ status: number; text: string; json: any }> {
  return { status: 200, text: "", json: {} };
}

export function setCssStyles(el: any, styles: Record<string, string>): void {
  Object.assign(el.style, styles);
}

export class WorkspaceLeaf { view: any; }
export class ItemView {
  containerEl: any = makeEl();
  contentEl: any = makeEl();
  leaf: any;
  constructor(leaf?: any) { this.leaf = leaf; }
  getViewType(): string { return ""; }
  getDisplayText(): string { return ""; }
  getIcon(): string { return ""; }
  async onOpen(): Promise<void> {}
  async onClose(): Promise<void> {}
}
export function setIcon(_el: any, _name: string): void {}
export class ButtonComponent {
  buttonEl: any = makeEl();
  constructor(_el?: any) {}
  setButtonText() { return this; }
  setCta() { return this; }
  setWarning() { return this; }
  setIcon() { return this; }
  setTooltip() { return this; }
  onClick(_cb: any) { return this; }
}
