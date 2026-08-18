# GUI-Smoke — Health Vitals

Was gegen ein **laufendes** Obsidian geprüft wird, statt gegen einen Mock (CORE-TEST-02 b).

Automatisiert fährt das `scripts/gui-smoke.ts`:

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/health-vitals" npm run deploy
npm run smoke:gui -- --vault <vault-name>
```

Der Lauf braucht einen **importierten Cache** im Ziel-Vault; ohne ihn zeigt das Dashboard
den Import-Screen und der Treiber bricht mit Ansage ab, statt rote Punkte zu melden.
Einzelne Abschnitte: `--section geruest|detail|phasen|theme|werte`.

## Warum das Werkzeug existiert

Am 2026-08-18 meldete der Hand-Smoke „das Schlafphasen-Chart ist leer". Dahinter lagen drei
unabhängige Fehler, die **286 grüne Unit-Tests strukturell nicht sehen konnten**: eine
SVG-Maßregel am falschen Selektor, ein Render-Abbruch durch `createSvg` (wirft bei zwei
Klassen in einem String) und eine Füllfarbe mit **1,06:1** gegen den Hintergrund. Ein
DOM-Test sieht Elemente, ein CSS-Text-Test sieht Deklarationen — *Fläche*,
*Abbruch-nach-Render* und *Kontrast* entstehen erst aus deren Kombination.

## Prüfpunkte (automatisiert)

| # | Abschnitt | Punkt | misst |
|---|---|---|---|
| 1 | geruest | Dashboard-Gerüst | 3 Tabs, 3 Panels im DOM |
| 2 | geruest | Tab-Wechsel wirkt sichtbar | genau **ein** Panel mit Höhe > 0 — nicht die `is-active`-Klasse |
| 3 | geruest | Sparkline hat Fläche | `.ah-tile-spark svg` (eigene Höhenregel, höhere Spezifität) |
| 4 | detail | Detail-Render wirft keine Ausnahme | gefangene Renderer-Ausnahme aus `openDetail` |
| 5 | detail | Detail-Chart hat Fläche | Bounding-Box des `.ah-chart` |
| 6 | detail | Chart-Inhalt hat Fläche | kleinste Balken-/Linienfläche > 0 |
| 7 | detail | Achsenbeschriftung sichtbar | y-Spaltenbreite (wird pro Render inline gesetzt) + Labelmaße |
| 8 | detail | x-Beschriftung überlappt nicht | Abstände der sortierten Label-Boxen |
| 9 | detail | Wochenlinien qualitativ unterschieden | `stroke-dasharray` gegen das Gitter (Lehre aus Slice 3c) |
| 10 | phasen | Phasen-Segmente gerendert | Anzahl `.ah-chart-stack` |
| 11 | phasen | Jedes Segment hat Fläche | kleinste Segmentfläche > 0 |
| 12 | phasen | Render lief zu Ende | Phasenmenge im Chart == Legende, x-Labels und Statistik-Zellen vorhanden |
| 13 | phasen | Legende zeigt die Chart-Farbe | `fill` des Segments == `background-color` des Swatch |
| 14 | phasen | Jedes Segment hat einen Tooltip | `<title>`-Anzahl == Segmentanzahl, keiner leer |
| 15 | phasen | Phasenfarben haben Kontrast | ≥ 3:1 gegen den effektiven Hintergrund (WCAG 1.4.11) |
| 16 | phasen | Phasenfarben paarweise verschieden | Farbkollision zweier Variablen im Theme |
| 17 | phasen | Hinweiszeile folgt dem Anteil | Flächenanteil „unbestimmt" > 50 % ⟺ `.ah-stage-note` da — in zwei Zeiträumen |
| 18 | theme | dieselben Farbpunkte in drei Varianten | Standard dunkel/hell (verbindlich) + aktives Theme (Hinweis) |
| 19 | werte | Werte-Tabelle sichtbar | Zeilen und Maße nach dem Aufklappen |

Prüfpunkt 17 ist als **Äquivalenz** formuliert, nicht als erwarteter Zustand: ob die Zeile
stehen muss, hängt vom Vault ab. Der Anteil wird aus den gerenderten Flächen gerechnet,
nicht aus dem ViewModel — sonst prüfte der Punkt den Code gegen sich selbst.

## Was der Treiber am Vault ändert — und zurückgibt

- **Sidebars** werden eingeklappt (die Szene wird hergestellt, nicht vorgefunden: im
  Arbeits-Vault blieben dem Dashboard sonst 123 px, und ein Chart dieser Breite bringt 137
  Segmente auf 0,01 px²). Vorzustand im `finally`.
- **Theme**: Body-Klassen und das Style-Element des Themes werden getauscht — nie
  `app.changeTheme`/`setTheme`, das schriebe nach `.obsidian/appearance.json`.
- **`data.json`**: Schnappschuss vor dem Lauf, Rückschreiben im `finally` samt
  `loadPluginData()`; das Ergebnis steht als `byte-gleich` / `ABWEICHUNG` im Protokoll.
- **Dashboard-Blatt**: nur geschlossen, wenn vor dem Lauf keines offen war.
- Es werden **keine Notizen angelegt** und **keine Gesundheitswerte protokolliert** — ins
  Protokoll gehen nur Struktur- und Darstellungsgrößen.

## Was Handarbeit bleibt

- Import eines echten Exports (Dateidialog, ~2,6 GB, Fortschritt/Abbruch).
- Export in die Zwischenablage und in eine Vault-Datei (Ordner-Autocomplete).
- Ästhetik: Farbwirkung, Dichte, „liest sich das".
- Favoriten-Toggle und Tastaturbedienung der Kacheln.

## Durchläufe

### 2026-08-18 — Erstlauf, Obsidian 1.13.7, Vault 10_Pallas, Plugin 0.5.1

**23/25 grün.** Rot sind beide Male derselbe Sachverhalt: `--color-cyan` (Phase „Kern")
kommt in **hellen** Themes auf 2,2–2,3:1 gegen den Hintergrund und verfehlt WCAG 1.4.11.
Der Befund ist nicht theme-spezifisch — er tritt in Obsidians Standardbelegung (`#00bfbc`
auf `#ffffff`, 2,29:1) genauso auf wie in Kuro (2,22:1). In dunklen Varianten ist alles
grün (schwächste 3,02:1). **Offen; siehe Cockpit.**

Nachgerechnet wurde bei der Gelegenheit auch die Farbfehlsichtigkeit: unter simulierter
Deuteranopie/Protanopie liegen die Phasenpaare im **hellen** Theme bei ΔE 6,8–7,6. Die
Aussage „ΔE 20–43, kein Ausweichplan nötig" vom selben Tag galt nur für Kuro/dunkel. Ein
`color-mix()` gegen `--text-normal` behebt zwar den Kontrast (min. 3,9:1), lässt ΔE aber auf
2,2 einbrechen, weil es alle Phasen zur Textfarbe zieht — **kein gangbarer Weg**.

**Gegenprobe** (der Schritt, der den Smoke erst gültig macht):

| Ausgebauter Fix | Ergebnis | Bewertung |
|---|---|---|
| alle drei (Stand `e9301c4`) | **10/27** statt 24/24, Punkte 4/10–17 rot, Fehlertext wörtlich `('ah-chart-stack ah-stage-deep') contains HTML space characters` | trägt |
| nur die Füllfarbe (`--text-muted` → `--background-modifier-border`) | **8/9**, einziger roter Punkt: Kontrast mit **1,06:1** | trägt punktgenau |
| nur die Maßregel (`.ah-chart` → `.ah-detail-chart svg`) | **9/9 grün** | **trägt nicht — siehe unten** |

**Bekannte Lücke:** Fehler 1 (Maßregel am Container) ist heute nicht mehr reproduzierbar.
Nachgemessen am historischen Stand hat das Phasen-SVG auch ohne die Regel volle Fläche
(768×312 px): ein SVG mit `viewBox` und ohne `width`/`height` fällt im Renderer auf die
Containerbreite zurück. Die Regel bleibt richtig — sie macht die Größe explizit statt vom
Default abhängig, und die Invarianten-Tests halten sie fest —, aber die Punkte 5/11 decken
diesen Fall nicht ab. Sie decken ab, was daneben liegt: kollabierte Container, `display:
none`, Höhe 0.

**Zwei Mängel im Treiber selbst** hat die Gegenprobe gefunden, beide behoben: eine
Renderer-Ausnahme riss den ganzen Lauf ab, statt einen Punkt rot zu machen (jetzt Punkt 4),
und Punkt 17 war grün, obwohl 0 Segmente gerendert waren — ein Prüfpunkt ohne Gegenstand,
der ausgerechnet im Defektfall bestätigt.
