import { beforeEach } from "vitest";
import { registerI18n, setLang } from "../src/i18n/strings";

beforeEach(() => {
  registerI18n();
  setLang("de");
});
