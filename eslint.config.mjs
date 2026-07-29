// Obsidian-Guideline-Gate (PROF-OBS-08): type-checked gegen ECHTE obsidian-Typen.
// KEIN Inline-`// eslint-disable` — genuin unvermeidbare Ausnahmen NUR als file-scoped
// Override unten, mit Begruendung (Review verbietet Inline-disables).
//
// Der Lauf umfasst bewusst das Repo-ROOT, nicht nur src/: die Regeln validate-manifest
// und validate-license greifen auf manifest.json bzw. LICENSE — beide liegen im Root.
// Ein auf src/ beschraenktes Gate sieht Store-Blocker in diesen Dateien nie.
//
// Type-checked Linting braucht `parserOptions.project` pro Datei-Gruppe — ohne eigenen
// Project-Eintrag wirft typescript-eslint auf jeder .ts-Datei einen Parser-Fehler ("you
// don't have parserOptions set to generate type information"). Root-weit gibt es daher
// zwei .ts-Gruppen mit je eigenem tsconfig, plus eine dritte Gruppe fuer die Node-Scripts:
//   - src/**/*.ts            → tsconfig.json (Build-Projekt)
//   - tests/**/*.ts,
//     scripts/**/*.ts,
//     *.ts (Root-Configs)    → tsconfig.test.json (Build-Projekt + Tests/Scripts, inkl.
//                              vitest-Globals; existierte schon, war aber noch nirgends
//                              verdrahtet — siehe dortige Kommentare)
//   - **/*.mjs                → KEIN eigenes Project noetig: obsidianmd.configs.recommended
//                              lintet .mjs bereits non-type-checked (typescript-eslint/recommended,
//                              nicht recommendedTypeChecked) — genau richtig fuer Node-Build-/
//                              Release-Scripts, die keine Obsidian-Plugin-Laufzeit sind.
//
// `...tseslint.configs.recommendedTypeChecked` wird NICHT mehr zusaetzlich top-level gespreadet
// (wie im ursprünglichen Entwurf): dessen "base"- und "recommended-type-checked"-Bausteine tragen
// selbst kein `files`, gelten also unscoped auf ALLES — inklusive .mjs-Dateien ohne Project, was
// prompt mit genau obigem Parserfehler crashte (reproduziert beim ersten Lauf gegen `eslint .`).
// obsidianmd.configs.recommended bringt intern bereits ein aequivalentes, korrekt nach
// js/cjs/mjs/jsx (untyped) vs. ts/cts/mts/tsx (typed) gescoptes typescript-eslint mit — die
// zusaetzliche globale Kopie war redundant und ist mit dem Root-Scope aktiv schaedlich.
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";
// PlainTextParser: obsidianmd exportiert das nicht ueber den Package-Main (dist/lib/index.js),
// nur intern fuer den eigenen Rule-Tester — Deep-Import gegen dist/, siehe
// node_modules/eslint-plugin-obsidianmd/dist/lib/plainTextParser.js. Kein "exports"-Feld in
// dessen package.json, das den Deep-Import unterbinden wuerde.
import { PlainTextParser } from "eslint-plugin-obsidianmd/dist/lib/plainTextParser.js";

export default tseslint.config(
  // .remember/ ist Claude Codes lokales Memory-/Scratch-Verzeichnis (global-gitignored,
  // nie getrackt, kein Projekt-Source) — gehoert nicht zum Lint-Gate.
  { ignores: ["main.js", "node_modules/", "tests/__mocks__/", "docs/", ".remember/"] },
  ...obsidianmd.configs.recommended,
  // obsidianmd.configs.recommended bringt validate-manifest/validate-license nur als
  // REGISTRIERTE Regeln mit (files: undefined bei der Plugin-Registrierung) — es gibt darin
  // aber KEINEN `files`-Eintrag, der tatsaechlich auf "manifest.json" oder "LICENSE" matcht
  // (nur "package.json" bekommt dort eine eigene JSON-Sprachkonfiguration). Ohne die beiden
  // folgenden Bloecke landen manifest.json/LICENSE bei "eslint ." als "kein Match" komplett
  // ausserhalb des Lint-Laufs — leise, ohne Fehler, aber eben ungeprueft. Reproduziert und
  // verifiziert per `eslint manifest.json` ("File ignored because no matching configuration").
  {
    // validate-manifest erwartet einen ESTree-Baum mit Program → ExpressionStatement →
    // ObjectExpression (siehe validateManifest.js: `body.expression.type !== ObjectExpression`).
    // Die naheliegende Wahl, @eslint/json ("json/json"-Sprache, wie obsidianmd es fuer
    // package.json nutzt) liefert stattdessen einen JSON-eigenen Baum (Document → Object →
    // Member/String/Number) — der `Program`-Visitor der Regel feuert darauf nie, die Regel
    // bleibt lautlos "gruen" ganz ohne je etwas zu pruefen (verifiziert: mit "json/json" blieb
    // die Regel bei sowohl fehlenden Pflichtfeldern als auch verbotenen Woertern im Namen
    // stumm). Der von obsidianmd selbst genutzte Rule-Tester (dist/tests/validateManifest.test.js)
    // laesst die Regel dagegen ohne jede Sprachkonfiguration laufen — @typescript-eslint/parser
    // parst ein Top-Level-Objektliteral wie manifest.json direkt als
    // ExpressionStatement→ObjectExpression (verifiziert per typescript-estree). Deshalb hier
    // derselbe Parser wie fuer den Rest des Repos, nur ohne `project` (die Regel braucht keine
    // Typinfo, nur den Syntaxbaum).
    files: ["manifest.json"],
    languageOptions: { parser: tseslint.parser },
    // "error", nicht "warn": Beide Regeln feuern ausschliesslich auf echte Store-
    // Submission-Blocker (siehe validateManifest.js) - eine Warnung, bei der
    // `npm run lint` trotzdem mit Exit-Code 0 durchlaeuft, reproduziert genau das
    // Problem, das Task 9 beheben sollte (ein Store-Blocker erreichte den Obsidian-Bot
    // ungesehen). Verifiziert per absichtlich kaputtem manifest.json: mit "warn" lief
    // `npm run lint` trotz 4 Verstoessen (fehlendes minAppVersion, fehlendes author,
    // "obsidian" im name, fehlender Punkt am Ende der description) mit Exit-Code 0
    // durch; mit "error" bricht derselbe Lauf mit Exit-Code 1 ab.
    rules: { "obsidianmd/validate-manifest": "error" },
  },
  {
    // validate-license braucht Zeilen-Tokens (AST_TOKEN_TYPES.Line) ueber die komplette
    // Datei, die PlainTextParser (obsidianmd-intern, s.o.) genau dafuer bereitstellt.
    files: ["LICENSE"],
    languageOptions: {
      parser: PlainTextParser,
      parserOptions: { extraFileExtensions: [""] },
    },
    // "error" aus demselben Grund wie bei validate-manifest oben.
    rules: { "obsidianmd/validate-license": "error" },
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // "*.ts" (kein "**/") faengt gezielt Root-Level-Configs wie vitest.config.ts —
    // ebenfalls Tooling, nicht Plugin-Code, aber .ts statt .mjs.
    files: ["tests/**/*.ts", "scripts/**/*.ts", "*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.test.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // vitest.config.ts setzt `globals: true` (Laufzeit) — ESLint kennt diese Test-Globals
      // ohne expliziten Import nicht von sich aus, sonst warnt no-undef auf jedem describe/it/expect.
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
      },
    },
  },
  // --- file-scoped Overrides ---------------------------------------------
  {
    // scripts/*.mjs, esbuild.config.mjs, eslint*.config.mjs: Node-Build-/Release-Tooling,
    // keine Obsidian-Plugin-Laufzeit. obsidianmd/rule-custom-message (Konsolen-Verbot) und
    // die auf `requestUrl` zugeschnittene no-restricted-globals-Meldung ("benutze requestUrl
    // statt fetch") ergeben fuer CLI-Skripte, die ausserhalb von Obsidian in Node laufen und
    // console-Ausgabe als Zweck haben, keinen Sinn — bestaetigt durch den ersten vollen Lauf
    // gegen `eslint .` (beide Regeln feuerten ausschliesslich in scripts/*.mjs).
    files: ["**/*.mjs"],
    rules: {
      "obsidianmd/rule-custom-message": "off",
      "no-restricted-globals": "off",
    },
  },
  {
    // tests/obsidian/**: konsumiert tests/__mocks__/obsidian.ts, einen bewusst simplen,
    // durchgaengig `any`-typisierten Mock (siehe dessen eigener Kommentar: lebt ausserhalb
    // src/, PROF-OBS-08). Jeder Zugriff auf den Mock ist damit für typescript-eslint ein
    // "unsafe"-Zugriff auf `any` — nicht, weil der Testcode unsicher waere, sondern weil der
    // Mock es per Design ist. Die "unsafe-*"-Familie waere hier > 200 Fund-Positionen ohne
    // echten Erkenntniswert; @typescript-eslint/no-explicit-any bleibt (als warn) aktiv als
    // Hinweis auf die Quelle. tests/core/** braucht das nicht (kein Obsidian-Mock) und bleibt
    // voll type-checked — bestaetigt: 0 unsafe-* Funde dort im vollen Lauf.
    files: ["tests/obsidian/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // no-explicit-any stand hier zunaechst weiter auf "warn", als Hinweis auf die Quelle.
      // Mit `--max-warnings 0` (package.json) geht das nicht mehr auf: Die Regel erzeugte
      // 81 Treffer, ausschliesslich in dieser Gruppe und ausschliesslich dort, wo Testcode
      // den bewusst `any`-typisierten Mock annotiert. Sie haette das Gate dauerhaft rot
      // gehalten und damit genau die Signalwirkung zerstoert, um die es geht. Die
      // Alternative — den Mock durchtypisieren — verwirft schon der Absatz oben. Fuer
      // src/** gilt die Regel unveraendert; dort steht kein einziges `any`.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // prefer-window-timers schuetzt Plugin-Laufzeitcode: In einem Obsidian-Popout-Fenster
    // zeigt das globale `setTimeout` auf das falsche Fenster. Testcode laeuft in Node, wo
    // es weder Popouts noch ueberhaupt ein `window` gibt — dieselbe Begruendung wie beim
    // .mjs-Block oben. Konkret betrifft es den window-Stub in clipboard.test.ts, der das
    // globale setTimeout absichtlich aufruft: Er IST dort die window-Implementierung.
    // no-global-this hat dieselbe Wurzel und faellt in tests/setup.ts auf den window-Shim
    // selbst: Die Regel verlangt „benutze window statt globalThis" — der Shim ist aber
    // gerade die Stelle, die `window` erst anlegt, und kann sich dafuer nicht auf sich
    // selbst berufen. Auch das gilt nur fuer Testcode; src/** benutzt globalThis nirgends.
    files: ["tests/**/*.ts"],
    rules: {
      "obsidianmd/prefer-window-timers": "off",
      "obsidianmd/no-global-this": "off",
    },
  },
  {
    // main-host.test.ts pinnt ausdruecklich, dass der Cache-Pfad NICHT von einem hartkodierten
    // ".obsidian" abhaengt (Test-Kommentar dort: "Bewusst ein NICHT-default configDir"). Dafuer
    // muss der String ".obsidian" als Test-Fixture UND im Testnamen auftauchen — genau das
    // meldet obsidianmd/hardcoded-config-path, ohne zwischen "hartkodiert" und "als Gegenbeispiel
    // verwendet, um Hartkodierung auszuschliessen" unterscheiden zu koennen.
    files: ["tests/obsidian/main-host.test.ts"],
    rules: { "obsidianmd/hardcoded-config-path": "off" },
  },
  // --- file-scoped Overrides (Beispiel, auskommentiert) ---------------------
  // {
  //   files: ["src/streaming.ts"],
  //   rules: { "obsidianmd/no-restricted-globals": "off" }, // SSE via activeWindow.fetch, requestUrl kann nicht streamen
  // },
);
