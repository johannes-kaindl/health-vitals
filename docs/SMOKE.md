# GUI-Smoke — Health Vitals

Was gegen ein **laufendes** Obsidian geprüft wird, statt gegen einen Mock (CORE-TEST-02 b).

Automatisiert fährt das `scripts/gui-smoke.ts`:

⚠️ **Zuerst prüfen, wer sonst an Obsidian hängt.** Obsidian ist Single-Instance — ein
`quit` trifft die Instanz, an der möglicherweise eine andere Session arbeitet, und zerstört
deren Zustand. Der eigene Lauf ist danach sauber grün; der Schaden entsteht woanders und
fällt nicht auf.

```bash
lsof -nP -iTCP:9222 -sTCP:LISTEN >/dev/null && echo "läuft bereits — NICHT beenden"
```

Hört der Port schon, dann **mitnutzen statt neu starten**: ein eigenes Fenster per
`vault-open` über IPC öffnen, dann `attachTo("workspace", port, vault)` — der Vault-Name
wählt, nicht die Reihenfolge. ⚠️ Die Port-Prüfung ersetzt die Frage nicht: sie zeigt aktive
CDP-Treiber, aber nicht, wer ein Fenster offen hält oder auf den Port wartet.

Erst wenn nichts läuft — oder nach Absprache mit dem, der es benutzt — gilt das Rezept unten.

```bash
osascript -e 'quit app "Obsidian"'
open -a Obsidian --args --remote-debugging-port=9222
OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/health-vitals" npm run deploy
npm run smoke:gui -- --vault <vault-name>
```

Der Lauf braucht einen **importierten Cache** im Ziel-Vault; ohne ihn zeigt das Dashboard
den Import-Screen und der Treiber bricht mit Ansage ab, statt rote Punkte zu melden.
Einzelne Abschnitte: `--section geruest|detail|phasen|farben|werte|workouts`.

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
| 15 | phasen | Hinweiszeile folgt dem Anteil | Flächenanteil „unbestimmt" > 50 % ⟺ `.ah-stage-note` da — in zwei Zeiträumen |
| 16 | farben | Phasenfarben haben Kontrast | ≥ 3:1 gegen den effektiven Hintergrund (WCAG 1.4.11) |
| 17 | farben | Phasenfarben paarweise verschieden | Farbkollision zweier Variablen einer Belegung |
| 18 | werte | Werte-Tabelle sichtbar | Zeilen und Maße nach dem Aufklappen |
| 19 | workouts | Monatssumme | `.ah-workout-total` sichtbar, Text enthält eine Ziffer oder den Gedankenstrich „—" |
| 20 | workouts | Zeilenwerte gefüllt | gefüllte gegen vorhandene `.ah-workout-dist`/`.ah-workout-kcal`-Zellen — nicht bloß deren Anwesenheit |

Prüfpunkt 15 ist als **Äquivalenz** formuliert, nicht als erwarteter Zustand: ob die Zeile
stehen muss, hängt vom Vault ab. Der Anteil wird aus den gerenderten Flächen gerechnet,
nicht aus dem ViewModel — sonst prüfte der Punkt den Code gegen sich selbst.

Prüfpunkt 19 ist aus demselben Grund keine Textprobe auf „km": Enthält der jüngste Monat
im Vault nur Workout-Typen ohne Distanz (Kraft, Yoga, HIIT), zeigt die Zeile korrekt den
Gedankenstrich „—" statt einer Kilometerzahl. Verlangt wird deshalb eine Ziffer **oder**
der Gedankenstrich — beides ist ein gültiges Render-Ergebnis, nur „nichts von beidem" ist
ein Fehler.

Die Farbpunkte (16/17) zählen **nur gegen Obsidians Standardbelegung** in die Bilanz, und
auch dort nur, wenn der Vault ein tauglicher Messplatz ist: Das Theme-CSS lässt sich zur
Messung abschalten (`styleEl.disabled`), CSS-Snippets und das Style-Settings-Plugin
**nicht** — die schreiben in eigene Style-Elemente und überleben das. Sind sie aktiv, wird
übersprungen und der Hinderungsgrund genannt. Die Werte werden trotzdem gemessen und als
Hinweis (`·`) protokolliert, in allen vier Kombinationen aus Belegung und Hell/Dunkel: der
Wert ist echt, nur die Zurechnung fehlt. **Ein Prüfpunkt gehört nur in die Bilanz, wenn
das Gemessene dem Prüfling zurechenbar ist** — sonst misst er die Werkbank.

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

**17/17 grün.** Die Farbpunkte wurden übersprungen — der Vault ist kein tauglicher
Messplatz (ein aktives CSS-Snippet + Style-Settings-Plugin). Als Hinweis gemessen:
`--color-cyan` (Phase „Kern") kommt in **hellen** Belegungen auf 2,2–2,3:1 und verfehlt
damit WCAG 1.4.11 — in der Standardbelegung (`#00bfbc` auf `#ffffff`, 2,29:1) wie im
eingestellten Theme (2,22:1). In dunklen Belegungen ist alles erfüllt (schwächste 3,02:1).

**Das war zunächst ein Verdacht, kein Befund**, und der Unterschied ist die Lehre dieses
Laufs: Die erste Fassung des Treibers meldete diese Werte als rote Prüfpunkte. Gemessen
wurde dabei aber die Werkbank — Snippet und Style-Settings belegen die Variablen auch bei
abgeschaltetem Theme-CSS.

### Nachtrag desselben Tages: im vanilla Vault gemessen — der Verdacht ist ein Befund

Mit `readme-shots` entstand ein Aufnahme-Vault ohne Theme, ohne Snippets, ohne
Style-Settings — der erste saubere Messplatz dieses Repos. Dort greifen die Farbpunkte:

```
npm run smoke:gui -- --vault apple-health --section farben     → 3/4 grün
  ✓ Standard dunkel: Kontrast   unspecified 8,13 · deep 4,24 · core 10,52 · rem 5,93
  ✗ Standard hell:   Kontrast   unspecified 6,69 · deep 4,95 · core 2,29 · rem 4,95
```

**`--color-cyan` (Phase „Kern") verfehlte WCAG 1.4.11 in hellen Belegungen.** Die Zahl war
dem Plugin zurechenbar, weil nichts anderes mehr im Spiel war.

**Behoben am selben Tag** (`color-mix(in srgb, var(--color-cyan) 75%, var(--text-normal))`,
entschieden am Bild aus vier gerenderten Varianten): derselbe Lauf meldet jetzt **4/4**,
Kern liegt bei **3,55:1** hell und **10,72:1** dunkel. Der Anteil 75 % ist der größte, der
in allen vier Belegungen über 3:1 bleibt — weniger Cyan verbessert den Kontrast weiter,
lässt die Phase aber ins Grau von „unbestimmt" laufen (bei 65 % fällt der Farbabstand
unter simulierter Deuteranopie von 6,8 auf 2,4).

Der Fix deckte prompt einen Mangel im Treiber auf: `getComputedStyle` liefert für
`color-mix` einen **`color(srgb …)`**-String mit Kanälen in 0…1, den der Farbparser nicht
kannte. Der Prüfpunkt meldete daraufhin `core ?:1` und **rot** — kein Wert, kein Beleg.
Das war die richtige Antwort, aber gemessen hätte er trotzdem werden müssen; der Parser
kennt jetzt beide Schreibweisen.

Nachgerechnet wurde bei der Gelegenheit auch die Farbfehlsichtigkeit: unter simulierter
Deuteranopie/Protanopie liegen die Phasenpaare im **hellen** Theme bei ΔE 6,8–7,6. Die
Aussage „ΔE 20–43, kein Ausweichplan nötig" vom selben Tag galt nur für Kuro/dunkel. Ein
`color-mix()` gegen `--text-normal` behebt zwar den Kontrast (min. 3,9:1), lässt ΔE aber auf
2,2 einbrechen, weil es alle Phasen zur Textfarbe zieht — **kein gangbarer Weg**.

**Gegenprobe** (der Schritt, der den Smoke erst gültig macht):

| Ausgebauter Fix | Ergebnis | Bewertung |
|---|---|---|
| alle drei (Stand `e9301c4`) | **10/27**, Punkte 4/10–17 rot, Fehlertext wörtlich `('ah-chart-stack ah-stage-deep') contains HTML space characters` | trägt |
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
und die Hinweiszeile war grün, obwohl 0 Segmente gerendert waren — ein Prüfpunkt ohne
Gegenstand, der ausgerechnet im Defektfall bestätigt.

**Einen dritten Mangel fand der Maintainer**, und er wiegt am schwersten: Die Farbpunkte
maßen einen Vault mit fremdem Theme, Snippet und Style-Settings und schrieben das Ergebnis
dem Plugin zu. Daraus die Messplatz-Prüfung und die Trennung zwischen Bilanz und Hinweis
(siehe oben).

### 2026-08-19 — Workouts-Kennzahlen, Obsidian 1.13.7, Vault apple-health (Aufnahme-Vault), Plugin 0.6.0

Zwei neue Prüfpunkte (19/20, Abschnitt `workouts`) für die Monatssumme und die
Zeilenwerte im Workouts-Tab. Der Aufnahme-Cache (`docs/images/fixture/make-health-cache.mjs`)
wurde dafür auf Version 3 gehoben und liefert seither `distanceKm`/`energyKcal` je Workout —
Krafttraining, Yoga und HIIT bewusst ohne Distanz.

```
npm run smoke:gui -- --vault apple-health
```

**24/24 grün.**

**Gegenprobe** (Pflicht, sonst ist ein grüner Prüfpunkt nichts wert): Text der beiden Spans
in `src/obsidian/tabs/workouts.ts` testweise auf `""` gesetzt, `npm run deploy && npm run
smoke:gui -- --vault apple-health --section workouts` gefahren:

```
✓ Workouts — Monatssumme — sichtbar=true, Text: 2026-06 · 12 Workouts · 69,6 km · 4.871 kcal
✗ Workouts — Zeilenwerte gefuellt — 0/100 Zellen mit Text
```

„Zeilenwerte gefüllt" wurde rot (0/100 statt 100/100), „Monatssumme" blieb erwartungsgemäß
grün — sie hängt an der Summenzeile, nicht an den Zeilen-Spans, und misst damit etwas
anderes. Änderung danach vollständig zurückgenommen (`git diff` leer), erneut deployt:
wieder 24/24 grün.

## Offen

_(nichts)_

## Erledigt

- ✅ **`--color-cyan` in hellen Belegungen** (2,2–2,3:1) — im vanilla Vault nachgemessen und
  am 2026-08-18 behoben (siehe Nachtrag oben). Die Vorarbeit bleibt hier stehen, weil sie
  die nächste Farbfrage beantwortet, bevor sie gestellt wird: Von allen Theme-Variablen halten nur `--color-red`,
  `--color-blue`, `--color-purple`, `--color-pink` und `--text-muted`/`--text-normal` in
  allen vier Kombinationen ≥ 3:1. Unter simulierter Deuteranopie/Protanopie erreicht
  **keine** Dreier-Palette ΔE ≥ 12 (bestes Ergebnis 10,7) — die Zuordnung kann Farbe allein
  nicht tragen; sie hängt hier ohnehin zusätzlich an der festen Stapelreihenfolge und den
  Tooltips. Ein `color-mix()` gegen `--text-normal` behebt zwar den Kontrast (min. 3,9:1),
  lässt ΔE aber auf 2,2 einbrechen, weil es alle Phasen zur Textfarbe zieht — kein Weg.
