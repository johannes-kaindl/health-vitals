import { Plugin } from "obsidian";

export default class AppleHealthPlugin extends Plugin {
  onload(): void {
    // Plugin initialization — commands, views, settings go here
  }

  onunload(): void {
    this.unload();
  }
}
