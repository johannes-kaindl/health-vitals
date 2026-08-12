// Repo-eigene ESLint-Abweichungen — der EINZIGE Ort dafuer. Der Kern
// (eslint.config.mjs) ist template-verwaltet, Inline-disables blockt das Lint-Gate.
// Jeder Override braucht eine Begruendung im Kommentar.
//
// Zwei Klassen, zwei Preise (Details: _docs/docs/obsidian-plugin-publishing.md):
// - Kosmetik-/Benennungsregeln (z. B. ui/sentence-case bei Eigennamen/API-Namen):
//   Override ist die richtige Antwort und kostet nichts — der Scanner hat keinen
//   Mangel gefunden, sondern eine Konvention falsch angelegt.
// - Faehigkeitsregeln (z. B. settings-tab/prefer-setting-definitions): der Scanner
//   bewertet den Mangel, nicht die Begruendung — ein Override hier ist gestundete
//   Schuld und kostet die Store-Wertung ("Satisfactory" statt "Passed").
//   Marker fuer solche Faelle: `// STORE-SCHULD:` + wo die Abloesung geplant ist.
//
// Store-Scanner-Paritaet (2026-08-13): die Vor-Migrations-eslint.config.mjs lintete
// bewusst das Repo-ROOT ("eslint ."), nicht nur src/ — u. a. damit validate-manifest/
// validate-license auf manifest.json/LICENSE greifen (obsidianmd.configs.recommended
// scoped diese Regeln nur auf **/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx} + package.json,
// NICHT auf "manifest.json" oder "LICENSE" — verifiziert per `eslint manifest.json`,
// s. Git-History dieser Datei). Ebenso gab es file-scoped Overrides fuer tests/**,
// scripts/**/*.mjs und root-*.mjs (Rule-custom-message/no-restricted-globals/
// prefer-window-timers/no-global-this/hardcoded-config-path), weil "eslint ." auch
// Tests und Node-Scripts erfasste.
// Der Template-Kern (eslint.config.mjs) ignoriert tests/**, scripts/**, docs/**,
// coverage/**, *.config.{mjs,ts,js} und lint script laeuft als "eslint src" (Parity
// mit allen Geschwister-Repos, s. epub-exporter/json_viewer/etc. — keines davon hat
// je einen tests/**- oder *.mjs-Override, weil bei ihnen ebenfalls nur src/ gelintet
// wird). Unter "eslint src" sind sowohl der manifest.json/LICENSE-Zusatzcheck als
// auch die vier tests/scripts-Overrides tote Konfiguration — kein Pfad, auf den sie
// noch matchen wuerden. Deshalb NICHT migriert. Das ist ein bewusster Scope-Verlust:
// manifest.json/LICENSE werden lokal nicht mehr vorab gelintet (die Store-Submission
// selbst prueft manifest.json serverseitig weiterhin). Tests/Scripts waren nie
// Store-relevant — dort ist der Verlust nur Konfiguration, kein Verhalten.
export default [
  {
    // Type-aware Linting braucht das Build-tsconfig des Repos. Achtung Falle
    // (json_viewer 1.9.0): ein obsidian→Mock-paths-Alias im referenzierten tsconfig
    // laesst die type-aware Regeln auf einen losen Mock aufloesen → no-unsafe-*-Kaskade.
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];
