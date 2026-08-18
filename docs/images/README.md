# Aufnahme-Vertrag — README-Bilder

Was welches Bild zeigen muss, damit `npm run shots` reproduzierbar dasselbe liefert.
Der Bild-Standard (Klassen, Anzeigebreiten, Budgets) ist **nicht** hier, sondern zentral:
`_docs/readme/readme-spec.json`, geprüft von `npm run shots:check`.

## Der Vertrag

| Datei | Klasse | referenziert von | muss zeigen |
|---|---|---|---|
| `overview.png` | hero | README § Features, § Usage → Dashboard | Ganzes Fenster, Tab **Overview**: drei Favoriten-Kacheln (Steps, Resting heart rate, Sleep) mit Kennzahl und Sparkline, darunter die aufgeklappte Kategorie **Activity** und die zugeklappten übrigen. Der Sinn des Bildes ist die Menge: viele Metriken auf einen Blick. |
| `detail-chart.png` | feature | README § Features, § Usage → Dashboard | Tab **Detail**, Metrik **Resting heart rate**, Zeitraum **3M**: Linie mit Min/Max-Band, beschriftete Achsen, gestrichelte Wochenanfänge, darunter die Kennzahlen-Zeile. Das Band muss sichtbar sein — es ist der Unterschied zwischen „Mittelwert" und „Mittelwert mit Streuung". |
| `sleep-stages.png` | feature | README § Features (Sleep stages), § How it works → Sleep | Tab **Detail**, Metrik **Sleep**, Zeitraum **3M**: oben der Verlauf, darunter die Sektion **Sleep stages** — gestapelte Balken je Nacht mit Legende (Deep / Core / REM) und der Kennzahlen-Zeile. Bei 3M trägt das Fixture durchgehend Phasen; die Hinweiszeile darf hier **nicht** erscheinen. |
| `sleep-stages-unspecified.png` | feature | README § Features (Sleep stages) | Dieselbe Sektion mit Zeitraum **All**: überwiegend neutrale Segmente plus die Hinweiszeile („In N% of nights in this period the device recorded no sleep stages."). Zeigt den Fall älterer Exporte, den der README-Text beschreibt — und belegt, dass die Zeile den Daten folgt statt immer dazustehen. |
| `values-export.png` | feature | README § Features (Copy/write), § Usage → Dashboard | Aufgeklappte Sektion **Values (N)** unter dem Detail-Chart: Export-Zeile (Copy, Save, MD/CSV, Folder mit Autocomplete-Feld) und die ersten Tabellenzeilen. |
| `workouts.png` | feature | README § Usage → Dashboard | Tab **Workouts**: Balken je Monat, darunter die Liste der jüngsten Einheiten mit Typ, Datum und Dauer. |
| `import.png` | feature | README § Usage, § Install | Der Zustand **vor** dem ersten Import: „No data yet", der Hinweis auf den Weg in der Health-App (Profile → Export All Health Data) und die Schaltfläche **Choose export**. Das ist der erste Bildschirm, den ein neuer Nutzer sieht — und die Antwort auf die Frage, wie Daten überhaupt hineinkommen. Der Zustand wird hergestellt, indem der Cache für die Dauer der Aufnahme beiseitegelegt und das Plugin neu geladen wird; danach zurück. |

Sieben Motive: Der zweite Schlafphasen-Zustand (`sleep-stages-unspecified.png`) kam zur
abgestimmten Liste dazu, weil er im selben Zustand nur einen Klick entfernt liegt — und
weil er die einzige Stelle ist, an der sich belegen lässt, dass die Hinweiszeile den Daten
folgt statt immer dazustehen.

Alle Bilder entstehen in **englischer** Oberfläche (`README.md` ist die kanonische Fassung;
`README.de.md` bettet dieselben Dateien ein).

## Was der Lauf voraussetzt

- **Ein Aufnahme-Vault**, gebaut aus `docs/images/fixture/` — `npm run shots -- --setup`.
  Ort: `$STAGING_VAULTS_DIR/apple-health` (Pflicht-Umgebungsvariable, kein Default: ein
  fest eingebauter Pfad wäre für jeden außer einer Person falsch, und
  `scripts/check-no-abs-paths.mjs` verbietet ihn zu Recht).
- **Ein laufendes Obsidian mit Debug-Port**, in dem dieser Vault geöffnet und einmalig als
  vertrauenswürdig bestätigt ist.
- **Kein Import.** Das Dashboard braucht `health-cache.json`; das Fixture legt ihn
  synthetisch an (siehe unten). Ein echter Import ist für die Bilder weder nötig noch
  zulässig.

## Die Daten sind erfunden — und das ist die Bedingung, nicht eine Einschränkung

`health-cache.json` enthält personenbezogene Gesundheitsdaten und ist in diesem Repo
gitignored. Ein Bild geht mit dem Repo um die Welt; Gewicht, Ruhepuls und Schlafzeiten
einer realen Person sind auch einzeln personenbezogen. Deshalb erzeugt
`fixture/make-health-cache.mjs` den Cache **synthetisch**:

- **Fester Seed** (mulberry32) statt `Math.random` — zwei Läufe ergeben dasselbe Bild.
- **Festes Enddatum** (2026-06-30) statt „heute": Die Zeitraum-Umschalter rechnen relativ
  zu `dateRange.to` aus dem Cache (`resolveRange`), nicht zum Kalender. Das Fixture altert
  also nicht.
- **Plausibel statt zufällig:** Schritte kennen Wochenenden, der Ruhepuls einen Trend über
  die Jahre, das Gewicht Messlücken. Die Phasen summieren sich exakt auf die Schlafzeit,
  und die Liegezeit umschließt sie — sonst zeigte das Chart Nächte, in denen mehr
  geschlafen als gelegen wurde.
- **Ein Bruch in der Mitte** (ab 2025-05-12 liefert das Gerät Phasen, davor nicht). Er ist
  der Grund, warum `sleep-stages.png` und `sleep-stages-unspecified.png` beide möglich
  sind: über den Gesamtzeitraum liegt der unaufgeschlüsselte Anteil über 50 % und löst die
  Hinweiszeile aus, in den letzten drei Monaten bei 0 %.

## Reproduktionsrezept

```bash
export STAGING_VAULTS_DIR="$HOME/StagingVaults"     # einmalig
npm run build
npm run shots -- --setup                            # Vault + synthetischer Cache

osascript -e 'quit app "Obsidian"'                  # Handarbeit: Debug-Port
open -a Obsidian --args --remote-debugging-port=9222
#   ... Vault "apple-health" öffnen, Vertrauen bestätigen

npm run shots                                       # alles aufnehmen
npm run shots -- --only sleep-stages.png            # eines nachziehen
npm run shots -- --list                             # diesen Vertrag als Liste
npm run shots:check                                 # Bild-Standard prüfen
```

Nach `--setup` muss Obsidian **neu starten**: Der Aufbau ersetzt Notizen, Layout und
Plugin-Einstellungen, und ein laufendes Obsidian hält den alten Stand im Speicher und
schreibt ihn zurück.

## Offen

_(nichts — fehlt ein Bild, gehört es mit Begründung hierher, nicht stillschweigend
gestrichen. `shots:check` meldet es dann bei jedem Lauf.)_

## Was die Bebilderung nebenbei gefunden hat

Ein Aufnahme-Lauf legt Zustände nebeneinander, die sonst niemand vergleicht — er ist
dadurch auch ein Audit. Beide Punkte sind **Befunde am Prüfling**, nicht an der Aufnahme,
und stehen hier, weil sie sonst im Chat verschwinden:

- **`--color-cyan` (Phase „Kern") verfehlt WCAG 1.4.11 in hellen Themes.** Der
  Aufnahme-Vault ist der erste saubere Messplatz des Repos (Standard-Theme, keine
  Snippets, kein Style-Settings-Plugin), und dort meldet
  `npm run smoke:gui -- --vault apple-health --section farben` **2,29:1** gegen den weißen
  Hintergrund; verlangt sind 3:1. In dunklen Belegungen ist alles erfüllt. Damit ist der
  Verdacht aus `docs/SMOKE.md` zum Befund geworden — die Farbwahl gehört korrigiert.
- **Favorit und Nicht-Favorit unterscheiden sich schwach.** Im Hero tragen die Favoriten
  einen Stern in Umrissform, die übrigen einen durchgestrichenen. Nebeneinander gelegt
  liest sich das eher wie „aktiv/deaktiviert" als wie „gemerkt/nicht gemerkt". Kein
  Fehler, aber im Bild deutlicher sichtbar als im Betrieb.
