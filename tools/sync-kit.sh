#!/bin/sh
# Re-vendor kit modules from ../obsidian-kit. Run after kit updates.
# Vorlage: koda-agent/tools/sync-kit.sh — stamp() ist byte-identisch mit dessen Fassung
# (md5 b70dfdbe8ff69eb14c9c0c53608b84d5; nachrechnen: sed -n '/^stamp()/,/^}/p' <datei> | md5).
# Dieselbe Funktion tragen zwoelf weitere Repos. Die in der Phase-3-Vorklaerung genannte
# md5 bd4545d82b1a97b743bd88bb9b56e738 gehoert NICHT zu stamp(), sondern zur `header=`-Zeile
# allein — hier stand sie bis 2026-08-20 an der Funktion und war damit nicht nachrechenbar.
set -e

KIT=../obsidian-kit
VER=$(node -p "require('$KIT/package.json').version")
SHA=$(git -C "$KIT" rev-parse --short HEAD)

stamp() { # stamp <vendored-file> <kit-relative-path>
  header="// vendored from obsidian-kit@$VER, $2 — do not hand-edit; re-vendor via tools/sync-kit.sh"
  printf '%s\n' "$header" | cat - "$1" > "$1.tmp"
  mv "$1.tmp" "$1"
}

# Kit-interne Querimporte aufs Vendor-Layout umschreiben. Im Kit liegen die Schichten als
# src/obsidian + src/pure nebeneinander, hier als src/vendor/kit-obsidian + src/vendor/kit —
# `../pure/` zeigt hier also ins Leere. Das ist die EINZIGE zulaessige Abweichung von verbatim;
# bei jedem Re-Vendor reproduzieren, sonst darf nichts abweichen.
# Praezedenz: kuro-gamification, markdown-presentation, vault-crews, vim-dojo (seit 0.26.0).
# Neun umgeschriebene Importzeilen, byte-identisch in dreien davon (md5 3aad7dd28a3a9875a3015a07bb78fc99;
# nachrechnen: grep -rh 'from "\.\./kit/' <repo>/src/vendor/kit-obsidian/ | md5). kuro-gamification
# traegt seit 2026-08-20 dieselben neun PLUS zwei clipboard-Zeilen — also ein Superset, keine Abweichung.
relayer() { # relayer <vendored-file>
  f=$1

  # (0) VORBEDINGUNG. Der Umschrieb setzt die Zwei-Ordner-Form der Kit-README voraus. Ohne sie
  #     zeigt `../kit/` von src/vendor/kit/ aus auf DIE DATEI SELBST — und weil obsidian/clipboard.ts
  #     und pure/clipboard.ts denselben Basenamen tragen, faellt das erst im Typecheck auf (TS2305).
  #     Laut abbrechen statt still falsch vendorieren.
  case "$f" in
    src/vendor/kit-obsidian/*) ;;
    *) echo "sync-kit: $f liegt nicht in src/vendor/kit-obsidian/ — der Querimport-Umschrieb setzt die Zwei-Ordner-Form voraus (obsidian-kit/README.md)" >&2; exit 1 ;;
  esac
  [ -d src/vendor/kit ] || { echo "sync-kit: src/vendor/kit/ fehlt — pure-Schicht anlegen, bevor gekoppelte Module mit Querimport vendoriert werden" >&2; exit 1; }

  # (1) Umschreiben, und feststellen OB umgeschrieben wurde. `cmp` statt md5: portabel,
  #     macOS (md5) und GitHub-CI (md5sum) heissen verschieden.
  sed 's|\(["'"'"']\)\.\./pure/|\1../kit/|g' "$f" > "$f.tmp"
  if cmp -s "$f" "$f.tmp"; then rm -f "$f.tmp"; return 0; fi   # nichts zu tun, KEINE Notiz
  mv "$f.tmp" "$f"

  # (2) Gegenprobe: bleibt ein ../pure/ stehen, bricht der Build spaeter und woanders.
  if grep -q '\.\./pure/' "$f"; then
    echo "sync-kit: '../pure/' in $f nicht umgeschrieben — Muster pruefen" >&2; exit 1
  fi

  # (3) Mitvendorier-Gegenprobe: jedes umgeschriebene Ziel muss auch wirklich da sein.
  for dep in $(sed -n 's|.*from ["'"'"']\.\./kit/\([A-Za-z0-9_/-]*\)["'"'"'].*|\1|p' "$f" | sort -u); do
    [ -f "src/vendor/kit/$dep.ts" ] || {
      echo "sync-kit: $f importiert ../kit/$dep, aber src/vendor/kit/$dep.ts fehlt — mitvendorieren" >&2; exit 1
    }
  done

  note="// ONE mechanical deviation from verbatim: kit-internal imports ../pure/ → ../kit/ (vendor layout); reproduce on every re-vendor, nothing else may differ."
  printf '%s\n' "$note" | cat - "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

mkdir -p src/vendor/kit src/vendor/kit-obsidian

# pure/ zuerst: relayer() Guard (3) prueft, dass die Querimport-Ziele schon liegen.
# `num` traegt kein eigener Consumer — settings_schema.ts:52 importiert es statisch.
for m in i18n vault-path cooperative-yield run-state clipboard num settings_schema; do
  cp "$KIT/src/pure/$m.ts" "src/vendor/kit/$m.ts"
  stamp "src/vendor/kit/$m.ts" "src/pure/$m.ts"
  echo "vendored obsidian-kit@$VER/pure/$m.ts"
done

for m in collapsible folder-suggest clipboard; do
  cp "$KIT/src/obsidian/$m.ts" "src/vendor/kit-obsidian/$m.ts"
  relayer "src/vendor/kit-obsidian/$m.ts"
  stamp "src/vendor/kit-obsidian/$m.ts" "src/obsidian/$m.ts"
  echo "vendored obsidian-kit@$VER/obsidian/$m.ts"
done

cat > src/vendor/kit/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "i18n.ts, vault-path.ts, cooperative-yield.ts, run-state.ts, clipboard.ts, num.ts, settings_schema.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. kit-obsidian/ siehe dessen VENDOR.json."
}
JSON
cat > src/vendor/kit-obsidian/VENDOR.json <<JSON
{
  "source": "obsidian-kit",
  "version": "$VER",
  "sha": "$SHA",
  "vendored": "collapsible.ts, folder-suggest.ts, clipboard.ts",
  "note": "Verbatim snapshot. Never hand-edit. Re-vendor via tools/sync-kit.sh. version/sha gelten AUSSCHLIESSLICH fuer die unter \"vendored\" gelisteten Dateien. EINE mechanische Abweichung von verbatim: kit-interne Importe ../pure/ -> ../kit/ (Vendor-Layout) in clipboard.ts; bei jedem Re-Vendor reproduzieren, sonst darf nichts abweichen."
}
JSON
echo "VENDOR.json → $VER ($SHA)"
