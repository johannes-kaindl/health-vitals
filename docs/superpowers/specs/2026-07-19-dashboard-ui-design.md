# Dashboard-UI — Design (Slice 2)

**Datum:** 2026-07-19
**Status:** freigegeben (Brainstorming), bereit für Implementierungsplan
**Vorläufer:** Slice 1 (Streaming-Parser + Tages-Aggregation), `health-cache.json`

## Ziel

Ein Dashboard, das das beim Import erzeugte `health-cache.json` **lazy** lädt und
Apple-Health-Daten durchsuchbar/visualisierbar macht: Übersicht vieler Metriken → Drilldown
in eine einzelne Metrik als Zeitreihe. Erste Chart-Rendering-Schicht im gesamten
obsidian-plugins-Ökosystem (kein bestehender Baustein — Registry/Kit haben keine Charts).

## Kontext & Constraints

- **Datenquelle** (`src/core/types.ts`): `HealthCache` mit
  `metrics: Record<identifier, MetricSeries>` (58 Metriken, je `unit`, `policy`,
  `daily: Record<"YYYY-MM-DD", DayBucket>`) und `workouts: WorkoutEntry[]` (768).
  DayBucket-Form hängt an der Policy:
  - `sum` → `{sum, count}` (z.B. Schritte)
  - `measure` → `{min, max, avg, count}` (z.B. Herzfrequenz, Gewicht)
  - `duration` → `{minutes, count}` (z.B. Schlaf, Achtsamkeit)
  - `dateRange` ≈ 2017–2026 (~3.300 Tage).
- **Verbindliche Standards:** `obsidian-plugins/UI-STANDARD.md` (Dach) — §1 Ein-Frontend-Regel,
  §2 Nativ-first, §3 CSS (nur Theme-Variablen, kein `#hex`, DOM nur via `createEl`,
  **nie** `innerHTML`), §4 Hub-View-Blaupause, §8 Baustein-Katalog. `AGENTS.md`
  PROF-OBS-03/04 (Pure Core / Obsidian-Schicht getrennt), CSS-Präfix `ah-`.
- **Chart-Ansatz** (Entscheidung): Hand-SVG via `createEl` — kein Chart-Library-Dependency
  (Nativ-first-Kultur, keine Chart-Lib in irgendeinem Plugin). Pure Geometrie ↔ DOM-Port getrennt.

## Architektur

Strikte Trennung Pure Core (Node-testbar) / Obsidian-Layer.

### Pure Core (`src/core/`, dependency-frei, voll unit-testbar)

| Modul | Aufgabe |
|---|---|
| `metric-catalog.ts` | `describeMetric(id) → {name, category, chartKind}`. Kuratierter deutscher Katalog (häufige ~40 Identifier) + Fallback für Unbekannte (Prefix `HKQuantityTypeIdentifier`/`HKCategoryTypeIdentifier` strippen, CamelCase splitten, Kategorie „Sonstige"). Kategorien: Aktivität, Herz, Körper, Schlaf, Ernährung, Sonstige. |
| `rollup.ts` | `rollupDaily(daily, granularity)` → Tag/Woche/Monat. **Policy-korrekt:** `sum`/`duration` summieren über den Bucket, `measure` mittelt (`avg`) und propagiert `min`/`max`. Woche = ISO-Woche; Monatsgrenzen sauber. |
| `chart-geometry.ts` | **Erstes Chart-Exemplar.** Punkte + Maße (Breite/Höhe/Padding) → SVG-Koordinaten: `scaleX`/`scaleY`, polyline-Punktliste (Linie), Balken-Rects, Achsen-Ticks, optionales min/max-Band. Reine Zahlen, **kein DOM**. Grenzfälle: leere Serie, ein Punkt, konstante Werte (keine Division durch 0). |
| `series-stats.ts` | Kennzahlen je Metrik/Zeitraum policy-abhängig: `sum`/`duration` → Ø/Tag, Max-Tag, Summe; `measure` → Ø, Min, Max, letzter Wert. |
| `view-model.ts` | Reine Builder: `buildOverviewVM(cache, favorites)` → Favoriten-Kacheln + Kategorie-Sektionen (je Kachel Kennzahl + Sparkline-Geometrie); `buildDetailVM(cache, metricId, range)` → Titel, Chart-Geometrie, Stat-Zeilen. |

### Obsidian-Layer (`src/obsidian/`)

| Modul | Aufgabe |
|---|---|
| `dashboard-view.ts` | `ItemView` (`VIEW_TYPE = "apple-health-dashboard"`, Icon, Kopf + Tab-Leiste + Content-Container). Lädt `health-cache.json` **lazy** beim Öffnen (einmal, dann gehalten). Hält State (aktiver Tab, gewählte Metrik, Range, Favoriten), ruft VM-Builder, delegiert an Tab-Renderer. Spricht ein schmales `DashboardHost`-Interface (§4-Invariante: View kennt weder Plugin noch fs direkt). |
| `chart-render.ts` | Nimmt `chart-geometry`-Output → baut SVG via `createEl('svg')` + `polyline`/`rect`/`line`/`text`. Farben ausschließlich über Theme-Variablen/Klassen (`--interactive-accent`, `--text-muted`, …). **Nie `innerHTML`.** |
| `tabs/overview.ts` | Favoriten-Kacheln (oben, groß) + ausklappbare Kategorie-Sektionen (`<details>`). Sparkline pro Kachel. Klick auf Kachel → `host.openDetail(id)` (wechselt zu Detail-Tab). |
| `tabs/detail.ts` | Metrik-Titel + Range-Presets (1M/3M/1J/Alles) + großer Chart + Stat-Zeilen (§8 Listen-Zeile horizontal). |
| `tabs/workouts.ts` | Monats-Count-Balken + Workout-Liste (Typ/Datum/Dauer). |
| `main.ts` | `registerView` + Command/Ribbon „Dashboard öffnen" (+ `revealLeaf`); behält den bestehenden Import-Command. |

**CSS:** `styles.css`, Präfix `ah-` (`.ah-tile`, `.ah-stat-row`, `.ah-chart`, …), nur
Theme-Variablen, kein `!important`. **Favoriten-Persistenz:** Metrik-Key-Liste in `data.json`
über das `mergeSettings`-Muster (kleines Settings-Objekt; lädt beim Start, ist winzig).

## Render-Muster (Hybrid, UI-STANDARD §4)

- **Tabs = Mount-once:** Übersicht/Detail/Workouts werden einmal gemountet, per
  `is-hidden` umgeschaltet. Detail-State (Metrik + Range + Scroll) überlebt Tab-Wechsel.
- **Innerhalb eines Tabs = ViewModel-Re-Render:** Metrik wählen / Range wechseln /
  Favorit togglen → betroffener Tab baut sich aus purem ViewModel neu auf
  (`empty()` + Neuaufbau). DOM = reine Funktion des Zustands.
- **Navigationszustand überlebt Re-Render** (in der View gehalten, nicht aus DOM zurückgelesen).

*Verworfen:* reines ViewModel-Re-Render für alles — einfacher, aber Detail verlöre bei
Tab-Wechsel seine Metrik/Range-Auswahl. Schlechtere UX für geringe Ersparnis.

## Datenfluss

```
health-cache.json ──(lazy, 1× beim Öffnen)──▶ cache im View-State
                                                    │
  Interaktion (Tab/Metrik/Range/Favorit)            │
       │                                            ▼
       └─▶ State-Update ─▶ view-model.ts (pure) ─▶ Tab-Renderer ─▶ chart-render (SVG)
                                  ▲
                     rollup.ts + series-stats.ts + metric-catalog.ts
```

Cache wird **einmal** gelesen und gehalten; Interaktionen mutieren nur State und rendern den
**betroffenen** Tab neu. Favoriten-Toggle: State + `data.json`-Persistenz über `host`, dann
Übersicht neu.

## Chart-Mapping je Policy

| Policy | Kachel-Sparkline | Detail-Chart | Stat-Zeilen |
|---|---|---|---|
| `sum` | Balken-Sparkline (Tages-Summen) | **Balken** je Bucket | Ø/Tag · Max-Tag · Summe |
| `measure` | Linien-Sparkline (Ø) | **Linie** (Ø) + optionales min/max-**Band** | Ø · Min · Max · letzter Wert |
| `duration` | Balken-Sparkline (Minuten) | **Balken** (Minuten/Bucket) | Ø/Tag · Max · Summe |

`chartKind` kommt aus dem Katalog (aus Policy abgeleitet, im Katalog überschreibbar).
Rollup respektiert die Policy (measure mittelt, sum/duration summieren).

## Zeitraum & Rollup (Detail)

Range-Presets **1M / 3M / 1J / Alles**. Auto-Rollup für Lesbarkeit/Performance:
1M/3M → Tage, 1J → Wochen-Buckets, Alles → Monats-Buckets (~108 Punkte statt ~3.300 rohe Tage).
Rollup-Grenze ist pure/testbare Core-Logik in `rollup.ts`.

## Fehler- & Empty-States (§8)

- **Kein `health-cache.json`** → Empty-State mit einem `mod-cta` „Import ausführen"
  (ruft den bestehenden Import-Command).
- **Cache kaputt/unlesbar** → Fehler-Karte mit Meldung.
- **Metrik ohne Daten im Zeitraum** → „Keine Daten in diesem Zeitraum" statt leerem Chart.
- **Unbekannter Identifier** → Fallback-Katalogeintrag (abgeleiteter Name, Kategorie „Sonstige").

## Testing

- **Pure Core voll unit-getestet:** Katalog-Fallback; Rollup je Policy inkl. Grenzfälle
  (Woche über Monatsgrenze, leere Buckets); Chart-Geometrie (Koordinaten, leere Serie, ein
  Punkt, konstante Werte → keine Division durch 0); Stats; VM-Builder.
- **Obsidian-Layer:** Tab-Renderer gegen `obsidian`-Mock (render in Fake-`el`, Host als Spy),
  wo sinnvoll.
- **Manueller Smoke-Test mandatory** (LESSONS.md 2026-07-19): SVG-DOM via `createEl` +
  `ItemView`-Lifecycle sind renderer-only → in Node-Tests unsichtbar. Verifikation im echten
  `00_ProtoVault` gegen den vorhandenen 2,6-MB-Cache.

## Kit-first / Ökosystem-Notiz

`chart-geometry.ts` (pure SVG-Geometrie) ist das **erste Chart-Exemplar** im Ökosystem →
späterer Kit-Kandidat (bei 2. Consumer im `drift-audit` bewerten). Hub-View-Gerüst,
Stat-Zeile, Info-Karte, Empty-State, Status-Indikator werden aus UI-STANDARD §4/§8
übernommen, nicht neu gebaut.

## YAGNI / bewusst ausgeklammert

- Keine Metrik-übergreifenden Vergleichs-Overlays (mehrere Serien in einem Chart) — späterer Slice.
- Keine Editier-/Annotations-Funktionen; Dashboard ist read-only auf dem Cache.
- Keine eigene Chart-Interaktivität (Tooltip/Zoom) über Range-Presets hinaus im ersten Slice.
- Kein Auto-Refresh; Cache wird beim Öffnen der View gelesen.
