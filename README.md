# Health Vitals

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

## Installation

**Aus dem Community-Store (empfohlen):** In Obsidian → *Einstellungen* →
*Community-Plugins* → *Durchsuchen* → nach **„Health Vitals"** suchen →
*Installieren* → *Aktivieren*.

**Manuell:** Von der [Releases-Seite](https://github.com/johannes-kaindl/health-vitals/releases)
`main.js`, `manifest.json` und `styles.css` des neuesten Releases herunterladen und in den
Ordner `<Vault>/.obsidian/plugins/health-vitals/` legen, dann in *Einstellungen* →
*Community-Plugins* aktivieren.

Das Plugin ist **Desktop-only** (`isDesktopOnly: true`) — der Import mehrere Gigabyte
großer XML-Dateien ist nur auf dem Desktop sinnvoll.

## Nutzung

1. In der **Health-App** (iPhone): Profil → *Alle Gesundheitsdaten exportieren*
   → die entstehende `Export.zip` auf den Rechner bringen.
2. In Obsidian: Ribbon-Icon **Health Vitals Dashboard** (oder Command-Palette →
   **„Health Vitals: Dashboard öffnen"**).
3. Im Dashboard **„Export auswählen"** klicken und die `Export.zip` (oder eine
   entpackte `Export.xml`) im Dateidialog wählen.

Der Lauf dauert bei großen Exports einige Minuten. Fortschritt, Phase und ein
Abbrechen-Button stehen währenddessen im Dashboard; danach öffnet sich die
Übersicht automatisch.

Ergebnis ist `health-cache.json` im Plugin-Verzeichnis: Tages-Aggregate je
Metrik plus eine Workout-Liste.

Die Oberfläche ist zweisprachig (Deutsch/Englisch) und folgt automatisch der
UI-Sprache von Obsidian — deutsche Obsidian-Oberfläche zeigt Deutsch, jede andere
Englisch. Es gibt dafür keine eigene Einstellung.

### Zugriff außerhalb des Vaults

Dieses Plugin liest **eine Datei außerhalb deines Vaults**: den Health-Export,
den du im Dateidialog auswählst. Das ist nötig, weil ein Apple-Health-Export
mehrere Gigabyte groß ist und nicht sinnvoll in einen Vault gehört. Diese
Export-Datei selbst wird ausschließlich gelesen — nichts davon wird
geschrieben, verschoben oder irgendwohin gesendet. Die daraus ausgewerteten
Daten landen als `health-cache.json` im Plugin-Verzeichnis auf deinem Rechner.

Getrennt davon kann das Detail-Tab auf Wunsch Werte-Tabellen **innerhalb**
des Vaults als Datei ablegen — das ist kein Zugriff außerhalb des Vaults,
sondern ein gewöhnlicher Schreibvorgang in einen von dir gewählten Ordner
deines Vaults. Details dazu unter „Datenschutz".

## Dashboard

Command-Palette → **„Health Vitals: Dashboard öffnen"** (oder das Ribbon-Icon).
Das Dashboard lädt `health-cache.json` **lazy** beim Öffnen — der Vault-Start
bleibt unbelastet. Drei Tabs:

- **Übersicht** — Kachel je Metrik mit Kennzahl und Sparkline. Metriken lassen
  sich per Stern als Favorit oben anpinnen (bleibt gespeichert); der Rest ist
  nach Kategorie gruppiert und ausklappbar.
- **Detail** — Klick auf eine Kachel öffnet die Zeitreihe: Zeitraum-Presets
  1M / 3M / 1J / Alles, darunter die passenden Kennzahlen. Lange Zeiträume
  werden automatisch gebündelt (Tage → Wochen → Monate), damit der Chart
  lesbar bleibt. Darunter lässt sich eine Werte-Tabelle mit den zugrunde
  liegenden Zeilen ausklappen; ihr Inhalt kann in die Zwischenablage
  kopiert oder als Markdown- oder CSV-Datei in einen selbst gewählten
  Vault-Ordner geschrieben werden (siehe „Datenschutz").
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
- `health-cache.json` ist **gitignored** — es landet nie versehentlich in
  einem Repo. Es gibt keinen `import/`-Ordner mehr; der Export wird direkt
  aus dem Dateidialog gelesen, ohne dass etwas ins Plugin-Verzeichnis
  kopiert wird.
- `isDesktopOnly: true` — der Import großer XML-Dateien ist nur auf dem Desktop
  sinnvoll.
- **Der Werte-Export im Detail-Tab schreibt in deinen Vault, aber nur wenn du
  auf „Speichern" klickst.** Es gibt dort eine ausklappbare Werte-Tabelle mit
  den Rohwerten der aktuellen Metrik und des aktuellen Zeitraums; ein Klick
  auf „Speichern" legt sie als `.md`- oder `.csv`-Datei in einem von dir
  gewählten Vault-Ordner ab (Ordnerfeld mit Autocomplete über deine
  bestehenden Ordner). Der Dateiname setzt sich aus Metrikname sowie erstem
  und letztem Zeitschlüssel der Tabelle zusammen. Existiert die Datei schon,
  wird sie **nie überschrieben** — stattdessen hängt das Plugin eine
  fortlaufende Nummer an (` 2`, ` 3`, …), bis ein freier Name gefunden ist.
  Diese Export-Dateien liegen danach wie jede andere Notiz in deinem Vault:
  wenn dein Vault synchronisiert oder versioniert wird, gilt das auch für sie.

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

Copyright © 2026 Johannes Kaindl

Lizenziert unter der [GNU AGPL v3.0 oder später](https://github.com/johannes-kaindl/health-vitals/blob/main/LICENSE).
