# Apple Health

Obsidian-Plugin, das **Apple-Health-Exports** einliest und die Daten im Vault
durchsuchbar und visualisierbar macht.

Kein HealthKit-Zugriff — Obsidian läuft in Electron, HealthKit ist eine native
iOS/macOS-API. Das Plugin arbeitet mit der Export-Datei, die du dir aus der
Health-App schickst.

## Warum

Apples `Export.xml` ist schnell **mehrere Gigabyte** groß (im Testfall 2,6 GB mit
5,7 Mio Records). Übliche XML-Parser laden das komplett in den Speicher und
stürzen ab. Dieses Plugin parst **streamend** (SAX-artig, chunk-weise) und legt
nur kompakte Tages-Aggregate ab — der Cache aus 5,7 Mio Records ist ~2,7 MB.

## Import

1. In der **Health-App** (iPhone): Profil → *Alle Gesundheitsdaten exportieren*
   → die entstehende `Export.zip` auf den Rechner bringen.
2. Die `.zip` (oder eine entpackte `Export.xml`) in den Ordner `import/` **im
   Plugin-Verzeichnis** legen:
   `<vault>/.obsidian/plugins/apple-health/import/`
3. In Obsidian: Command-Palette → **„Apple Health: Import ausführen"**.

Der Lauf dauert bei großen Exports einige Minuten und meldet den Fortschritt per
Notice. Am Ende steht eine Zusammenfassung (Records, Metriken, Workouts,
Zeitraum), die bis zum Klick stehen bleibt.

Ergebnis ist `health-cache.json` im Plugin-Verzeichnis: Tages-Aggregate je
Metrik plus eine Workout-Liste.

## Dashboard

Command-Palette → **„Apple Health: Dashboard öffnen"** (oder das Ribbon-Icon).
Das Dashboard lädt `health-cache.json` **lazy** beim Öffnen — der Vault-Start
bleibt unbelastet. Drei Tabs:

- **Übersicht** — Kachel je Metrik mit Kennzahl und Sparkline. Metriken lassen
  sich per Stern als Favorit oben anpinnen (bleibt gespeichert); der Rest ist
  nach Kategorie gruppiert und ausklappbar.
- **Detail** — Klick auf eine Kachel öffnet die Zeitreihe: Zeitraum-Presets
  1M / 3M / 1J / Alles, darunter die passenden Kennzahlen. Lange Zeiträume
  werden automatisch gebündelt (Tage → Wochen → Monate), damit der Chart
  lesbar bleibt.
- **Workouts** — Workouts pro Monat als Balken, darunter die letzten Einheiten
  mit Typ, Datum und Dauer.

Charts sind handgezeichnetes SVG ohne Chart-Library und nutzen ausschließlich
Obsidian-Theme-Variablen — sie passen sich also jedem Theme (hell/dunkel/
Community) an.

### Wie Metriken aggregiert werden

Die Darstellung richtet sich nach der Art der Metrik:

| Art | Beispiele | Aggregation | Chart |
|---|---|---|---|
| `sum` | Schritte, Kalorien | Tages-Summe | Balken |
| `measure` | Gewicht, Puls | Ø mit Min/Max | Linie + Band |
| `duration` | Schlaf, Achtsamkeit | Minuten-Summe | Balken |

Bei Wochen-/Monatsbündelung wird entsprechend summiert bzw. gemittelt (nicht
summiert) — ein Ø-Puls über einen Monat bleibt ein Mittelwert.

## Datenschutz

Gesundheitsdaten sind besonders sensibel. Deshalb:

- **Alles bleibt lokal.** Das Plugin sendet nichts nach außen, es gibt keine
  Netzwerkaufrufe.
- `import/` und `health-cache.json` sind **gitignored** — sie landen nie
  versehentlich in einem Repo.
- `isDesktopOnly: true` — der Import großer XML-Dateien ist nur auf dem Desktop
  sinnvoll.

Wenn du deinen Vault synchronisierst, liegt `health-cache.json` im
Plugin-Ordner unter `.obsidian/` und wird je nach Sync-Konfiguration
mitgenommen — das ist bewusst deine Entscheidung.

## Entwicklung

```bash
npm run dev        # esbuild watch
npm run build      # typecheck + production bundle → main.js
npm test           # vitest
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (obsidianmd, type-checked)
npm run deploy     # build + copy nach $OBSIDIAN_PLUGIN_DIR
```

Der Code ist in eine **reine Kern-Schicht** (`src/core/` — Parser, Aggregation,
Chart-Geometrie, ViewModels; ohne `obsidian`-Import, in Node testbar) und eine
**Obsidian-Schicht** (`src/obsidian/` — View, SVG-Rendering, Dateizugriff)
getrennt. Konventionen und Architektur-Notizen: `AGENTS.md`.

**Hinweis für Beiträge:** Renderer-spezifisches Verhalten (SVG-DOM, `ItemView`,
Web-Worker) ist in Node-Unit-Tests unsichtbar — Änderungen an der
Obsidian-Schicht brauchen zusätzlich einen manuellen Test in echtem Obsidian.

## Lizenz

AGPL-3.0-or-later (siehe `license`-Feld in `package.json`; eine `LICENSE`-Datei
fehlt bislang und sollte noch ergänzt werden).
