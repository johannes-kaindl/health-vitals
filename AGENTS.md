# AGENTS.md

**Profil:** `ts-node` · `obsidian-plugin`.

> **Workspace-Standards (maintainer-lokal):** Die verbindliche Leitkonvention steht in `_docs/CONVENTIONS.md`
> im Multi-Projekt-Workspace des Maintainers, `../../_docs` relativ zu diesem Repo — nicht Teil dieses Repos,
> ignorieren falls im Klon nicht vorhanden. Modell comply-or-explain.

## Project character

**Projekt:** `health-vitals` (Repo-Verzeichnis weiterhin `apple-health`, PROF-OBS-11) — Obsidian-Plugin,
das **Apple Health XML-Exports** (Health-App → Export) parscht und im Vault durchsuchbar/visualisierbar
macht. **Kein HealthKit-Zugriff** — Obsidian läuft in Electron, HealthKit ist native iOS/macOS API.
User wählt die Export-Datei (`Export.zip` oder `Export.xml`) im Dashboard über einen nativen
Dateidialog aus.

**Autor:** Johannes Kaindl.

## Architecture

- **Datei-Picker** — Dashboard-Button „Export auswählen" öffnet einen nativen Dateidialog; die
  gewählte Datei wird per `file.stream()` gelesen. Ihr Pfad wird nicht gespeichert, nichts wird ins
  Vault oder Plugin-Verzeichnis kopiert.
- **Streaming XML-Parser** — Health-Exports können ~2 GB groß sein → SAX/streaming, kein DOM-Parsing.
- **Cache in `health-cache.json`** (separate Datei im Plugin-Dir, **lazy** beim Öffnen des Dashboards geladen — nicht in `data.json`, das würde bei jedem Start blockieren). Geparste Tages-Aggregate. **Gitignored.**
- **Reiner Kern / Obsidian-Schicht** Trennung (PROF-OBS-03/04): Parser-Logik ohne obsidian-Import, in Node testbar.

`isDesktopOnly: true` — XML-Import nur auf Desktop sinnvoll.

## Commands

```bash
npm run dev          # esbuild watch
npm run build        # typecheck + production bundle → main.js
npm run deploy       # build + copy to $OBSIDIAN_PLUGIN_DIR
npm run lint         # eslint src (obsidianmd type-checked)
npm test             # vitest run
npm run typecheck    # tsc --noEmit
```

## Conventions

- **CSS-Prefix:** `ah-` (z.B. `.ah-panel`, `.ah-stat-row`) — bleibt, entkoppelt von der Plugin-ID (PROF-OBS-11)
- **Plugin-ID:** `health-vitals` (Name: „Health Vitals"; Repo/Verzeichnis-Name (`apple-health`), View-Type
  (`apple-health-dashboard`) und CSS-Prefix (`ah-`) bleiben unverändert)

## Gotchas

- **Apple Health XML** ist undocumented, hierarchisch, extrem redundant — Parser muss robust gegen
  Schema-Änderungen zwischen Health-App-Versionen sein.
- **`health-cache.json` niemals committen** — enthält personenbezogene Gesundheitsdaten.
- **Große Dateien:** Streaming-Parser ist mandatory; DOM-basierte Parser craschen bei >1 GB.

## Memory

- **SDD-Artefakte (seit 2026-07-16): Cockpit, nicht Repo** — Specs/Plans/Task-Reports leben im
  Coding-Cockpit des Maintainers (`$VAULT/25_Coding/apple-health/_SDD/`, CORE-META-14, maintainer-lokal).
  Sie tragen Arbeitskontext (Vault-Pfade, Schwester-Repo-Interna), der in einem public Repo niemandem nützt.
  Das Repo behält die Design-Essenz in dieser Datei + `CHANGELOG.md`.
- **Alt-Bestand:** `docs/superpowers/{specs,plans}/` ist eingefroren — nichts Neues dort ablegen.
- **Nie im Repo:** absolute Pfade außerhalb des Repos (`/Users/…`, Vault-Pfade) — Platzhalter nutzen
  (`$VAULT/…`, `~/…`, repo-relativ). Herkunftsnachweise als Repo-Name + `Datei:Zeile` sind dagegen erwünscht.
  Gate: `scripts/check-no-abs-paths.mjs` (Teil von `npm test`).

## Dach-Kontext

See `../AGENTS.md` (Kit-first-Regel, Registry, UI-STANDARD, release flow).
**Vor jeder UI-Arbeit:** `../UI-STANDARD.md` ist verbindlich.
