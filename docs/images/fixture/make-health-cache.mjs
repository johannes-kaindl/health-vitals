/**
 * Erzeugt den `health-cache.json` des Aufnahme-Vaults — **synthetisch, deterministisch**.
 *
 * ## Warum ein Generator und kein eingecheckter Cache
 *
 * Ein echter Cache ist in diesem Repo per Konvention unmöglich: `health-cache.json`
 * enthält personenbezogene Gesundheitsdaten und ist gitignored (AGENTS.md). Ein
 * abgespeckter echter Auszug wäre nur scheinbar harmlos — Gewicht, Ruhepuls und
 * Schlafzeiten einer realen Person sind auch einzeln personenbezogen, und ein README-Bild
 * geht mit dem Repo um die Welt.
 *
 * Also: erfundene Zahlen, die sich wie echte verhalten. Sie müssen plausibel genug sein,
 * dass die Charts nicht wie Rauschen aussehen — ein Ruhepuls braucht einen Trend und eine
 * Streuung, Schritte brauchen Wochenenden, Schlaf braucht schlechte Nächte.
 *
 * ## Determinismus
 *
 * Zwei Läufe müssen dasselbe Bild ergeben, sonst ist jede Neuaufnahme ein Diff. Deshalb:
 *
 * - **Fester Seed** (mulberry32, fünf Zeilen) statt `Math.random`.
 * - **Festes Enddatum** statt „heute". Die Zeitraum-Umschalter des Plugins rechnen relativ
 *   zu `dateRange.to` aus dem Cache (`resolveRange` in src/core/rollup.ts), nicht zum
 *   Kalender — ein Cache, der 2026-06-30 endet, zeigt bei „1M" also den Juni 2026 und
 *   nicht etwa nichts. Ohne diese Eigenschaft müsste das Fixture mitaltern.
 *
 * ## Was die Daten erzählen sollen
 *
 * Der Zeitraum beginnt 2024-01-01 und trägt einen **Bruch in der Mitte**: davor kennt der
 * Export nur „Schlaf" ohne Aufschlüsselung (vor watchOS 9 gibt es keine Phasen), danach
 * Tief/Kern/REM. Das ist kein Zierrat — es ist der Fall, für den das Plugin die neutrale
 * Färbung und die Hinweiszeile hat, und ein Fixture ohne ihn könnte beides nie zeigen.
 *
 * Aufruf (durch `buildVault`, `VaultSpec.generator`): `node make-health-cache.mjs <vaultDir>`
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PLUGIN_ID = "health-vitals";
const VON = "2024-01-01";
const BIS = "2026-06-30";
/**
 * Ab hier liefert das Gerät Schlafphasen; davor nur „unbestimmt" (vor watchOS 9 — hier
 * gelesen als Gerätewechsel in der Mitte des Zeitraums).
 *
 * Das Datum ist bewusst so gewählt, dass über den **Gesamtzeitraum mehr als die Hälfte**
 * der Schlafzeit unaufgeschlüsselt ist: nur dann zeigt „Alles" die Hinweiszeile, die das
 * Plugin ab 50 % einblendet, während „3M" die saubere Aufschlüsselung zeigt. Ein Fixture,
 * das nur einen der beiden Zustände hergibt, könnte den anderen nie bebildern.
 */
const PHASEN_AB = "2025-05-12";

// --- Deterministischer Zufall ------------------------------------------------

/** mulberry32 — klein, schnell, reproduzierbar. Derselbe Seed, dieselben Bilder. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const zufall = rng(20260818);

/** Normalverteilt (Box-Muller), damit Streuung wie Streuung aussieht und nicht wie ein Band. */
function gauss(mittel, streuung) {
  const u = Math.max(zufall(), 1e-9);
  const v = zufall();
  return mittel + streuung * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const runde = (n, stellen = 0) => Number(n.toFixed(stellen));
const klemme = (n, min, max) => Math.min(max, Math.max(min, n));

// --- Kalender ----------------------------------------------------------------

function* tage(von, bis) {
  const ende = new Date(`${bis}T00:00:00Z`);
  for (let d = new Date(`${von}T00:00:00Z`); d <= ende; d.setUTCDate(d.getUTCDate() + 1)) {
    yield {
      iso: d.toISOString().slice(0, 10),
      wochentag: d.getUTCDay(), // 0 = Sonntag
      /** 0 … 1 über den Gesamtzeitraum — Träger für langsame Trends. */
      fortschritt: 0,
      /** Jahreszeit als Sinus, damit Aktivität im Sommer steigt. */
      saison: Math.sin(((d.getUTCMonth() + d.getUTCDate() / 30) / 12) * 2 * Math.PI - Math.PI / 2),
    };
  }
}

const ALLE = [...tage(VON, BIS)];
ALLE.forEach((t, i) => { t.fortschritt = i / (ALLE.length - 1); });

// --- Metriken ----------------------------------------------------------------

/**
 * Eine Serie ist ein Bauplan, keine Tabelle: `wert(tag)` erzeugt den Tageswert, `policy`
 * bestimmt die Bucket-Form (src/core/aggregation-policy.ts — `sum` addiert, `measure`
 * trägt min/max/avg, `duration` Minuten).
 */
const SERIEN = [
  {
    id: "HKQuantityTypeIdentifierStepCount",
    unit: "count",
    policy: "sum",
    // Wochenende deutlich niedriger, Sommer höher — sonst sieht ein Balkenchart aus
    // wie ein Zaun aus identischen Latten.
    wert: (t) => klemme(
      gauss(8600 + t.saison * 1400 + t.fortschritt * 900, 2100)
        * (t.wochentag === 0 || t.wochentag === 6 ? 0.72 : 1),
      900, 24000,
    ),
  },
  {
    id: "HKQuantityTypeIdentifierDistanceWalkingRunning",
    unit: "km",
    policy: "sum",
    wert: (t) => klemme(gauss(6.4 + t.saison * 1.1, 1.7), 0.6, 18),
    stellen: 2,
  },
  {
    id: "HKQuantityTypeIdentifierFlightsClimbed",
    unit: "count",
    policy: "sum",
    wert: () => klemme(Math.round(gauss(11, 5)), 0, 40),
  },
  {
    id: "HKQuantityTypeIdentifierActiveEnergyBurned",
    unit: "kcal",
    policy: "sum",
    wert: (t) => klemme(gauss(540 + t.saison * 90, 150), 90, 1600),
  },
  {
    id: "HKQuantityTypeIdentifierAppleExerciseTime",
    unit: "min",
    policy: "sum",
    wert: () => klemme(Math.round(gauss(34, 18)), 0, 140),
  },
  {
    id: "HKQuantityTypeIdentifierRestingHeartRate",
    unit: "count/min",
    policy: "measure",
    // Leichter Abwärtstrend über die Jahre: die Detailansicht soll etwas zu erzählen
    // haben, wenn man von „1M" auf „Alles" schaltet.
    wert: (t) => klemme(gauss(58 - t.fortschritt * 4.5, 2.6), 46, 78),
    spanne: 3,
    messungenProTag: [1, 3],
  },
  {
    id: "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
    unit: "ms",
    policy: "measure",
    wert: (t) => klemme(gauss(38 + t.fortschritt * 6, 9), 14, 92),
    spanne: 12,
  },
  {
    id: "HKQuantityTypeIdentifierHeartRate",
    unit: "count/min",
    policy: "measure",
    wert: () => klemme(gauss(72, 5), 52, 105),
    spanne: 45,
    messungenProTag: [180, 600],
  },
  {
    id: "HKQuantityTypeIdentifierOxygenSaturation",
    unit: "%",
    policy: "measure",
    wert: () => klemme(gauss(97.2, 0.9), 93, 100),
    stellen: 1,
    spanne: 2,
  },
  {
    id: "HKQuantityTypeIdentifierBodyMass",
    unit: "kg",
    policy: "measure",
    // Gewicht wandert langsam und wird nicht jeden Tag gemessen (siehe luecken).
    wert: (t) => runde(gauss(74.5 - t.fortschritt * 2.2 + Math.sin(t.fortschritt * 9) * 0.8, 0.5), 1),
    stellen: 1,
    spanne: 0.3,
    luecken: 0.55,
    messungenProTag: [1, 2],
  },
  {
    id: "HKQuantityTypeIdentifierDietaryWater",
    unit: "mL",
    policy: "sum",
    wert: () => klemme(Math.round(gauss(1900, 480) / 50) * 50, 400, 3600),
    luecken: 0.25,
  },
];

// --- Schlaf ------------------------------------------------------------------

/**
 * Schlaf entsteht anders als die übrigen Serien: Die beiden Serien (`SleepAsleep`,
 * `SleepInBed`) und die Phasen-Aufschlüsselung müssen **zueinander passen** — die Summe
 * der Phasen ist die Schlafzeit, und die Liegezeit umschließt sie. Zwei unabhängig
 * gewürfelte Serien ergäben Nächte, in denen mehr geschlafen als gelegen wurde.
 */
function schlaf() {
  const asleep = {};
  const inBed = {};
  const stages = {};

  for (const t of ALLE) {
    // Ein paar Nächte ohne Aufzeichnung — die Uhr lädt, das Telefon liegt woanders.
    if (zufall() < 0.04) continue;

    const schlafMin = Math.round(klemme(
      gauss(432 + (t.wochentag === 0 || t.wochentag === 6 ? 26 : 0), 46),
      250, 610,
    ));
    const wachMin = Math.round(klemme(gauss(24, 9), 4, 62));

    asleep[t.iso] = { minutes: schlafMin, count: 1 };
    inBed[t.iso] = { minutes: schlafMin + wachMin, count: 1 };

    if (t.iso < PHASEN_AB) {
      // Vor watchOS 9: das Gerät meldet Schlaf, aber keine Phase. Genau der Fall, für den
      // das Plugin das neutrale Segment und die Hinweiszeile hat.
      stages[t.iso] = { core: 0, deep: 0, rem: 0, unspecified: schlafMin, awake: wachMin };
      continue;
    }
    // Anteile in der Größenordnung, die Apple Watch typischerweise ausweist. Kern trägt
    // den Rest, damit die Summe exakt der Schlafzeit entspricht.
    const tief = Math.round(schlafMin * klemme(gauss(0.17, 0.035), 0.08, 0.27));
    const rem = Math.round(schlafMin * klemme(gauss(0.22, 0.04), 0.11, 0.33));
    stages[t.iso] = {
      core: schlafMin - tief - rem,
      deep: tief,
      rem,
      unspecified: 0,
      awake: wachMin,
    };
  }
  return { asleep, inBed, stages };
}

// --- Workouts ----------------------------------------------------------------

const WORKOUT_TYPEN = [
  { type: "HKWorkoutActivityTypeRunning", dauer: [28, 62] },
  { type: "HKWorkoutActivityTypeCycling", dauer: [40, 95] },
  { type: "HKWorkoutActivityTypeWalking", dauer: [25, 70] },
  { type: "HKWorkoutActivityTypeTraditionalStrengthTraining", dauer: [35, 55] },
  { type: "HKWorkoutActivityTypeYoga", dauer: [20, 45] },
  { type: "HKWorkoutActivityTypeSwimming", dauer: [30, 50] },
  { type: "HKWorkoutActivityTypeHighIntensityIntervalTraining", dauer: [18, 32] },
];

function workouts() {
  const liste = [];
  for (const t of ALLE) {
    // Etwa jeden dritten Tag eine Einheit, im Sommer etwas häufiger.
    if (zufall() > 0.3 + t.saison * 0.06) continue;
    const art = WORKOUT_TYPEN[Math.floor(zufall() * WORKOUT_TYPEN.length)];
    const stunde = 6 + Math.floor(zufall() * 13);
    liste.push({
      type: art.type,
      start: `${t.iso}T${String(stunde).padStart(2, "0")}:${zufall() < 0.5 ? "00" : "30"}`,
      durationMin: Math.round(art.dauer[0] + zufall() * (art.dauer[1] - art.dauer[0])),
    });
  }
  return liste;
}

// --- Zusammenbau -------------------------------------------------------------

function baueCache() {
  const metrics = {};

  for (const serie of SERIEN) {
    const daily = {};
    for (const t of ALLE) {
      if (serie.luecken && zufall() < serie.luecken) continue;
      const wert = runde(serie.wert(t), serie.stellen ?? 0);
      if (serie.policy === "sum") {
        daily[t.iso] = { sum: wert, count: 1 + Math.floor(zufall() * 40) };
      } else {
        // min/max um den Mittelwert herum: Das Detail-Chart zeichnet daraus das Band um
        // die Linie. Ohne Spanne wäre es ein Strich und die Band-Darstellung nie sichtbar.
        const spanne = serie.spanne ?? 1;
        const min = runde(wert - Math.abs(gauss(spanne, spanne * 0.3)), serie.stellen ?? 0);
        const max = runde(wert + Math.abs(gauss(spanne, spanne * 0.3)), serie.stellen ?? 0);
        // `count` ist die Zahl der Roh-Records hinter dem Tag. Sie steht heute in keinem
        // Bild, gehört aber trotzdem in die Größenordnung: Gewicht misst man einmal,
        // Puls misst die Uhr im Minutentakt. Ein Fixture, das darin unplausibel ist,
        // wird es in dem Moment sichtbar, in dem eine Ansicht den Wert zeigt.
        const messungen = serie.messungenProTag ?? [6, 90];
        daily[t.iso] = {
          min, max, avg: wert,
          count: messungen[0] + Math.floor(zufall() * (messungen[1] - messungen[0])),
        };
      }
    }
    metrics[serie.id] = { unit: serie.unit, policy: serie.policy, daily };
  }

  const { asleep, inBed, stages } = schlaf();
  metrics.SleepAsleep = { unit: "min", policy: "duration", daily: asleep };
  metrics.SleepInBed = { unit: "min", policy: "duration", daily: inBed };

  const liste = workouts();
  const recordCount = Object.values(metrics)
    .reduce((s, m) => s + Object.values(m.daily).reduce((a, b) => a + (b.count ?? 1), 0), 0);

  return {
    version: 2,
    // Ein erfundener Dateiname: der echte Pfad des Maintainers gehört in kein Repo, und
    // der Wert steht dem Nutzer im Dashboard nirgends prominent gegenüber.
    sourceFile: "Export.zip",
    importedAt: `${BIS}T09:12:00`,
    recordCount,
    skippedCount: 0,
    dateRange: { from: VON, to: BIS },
    metrics,
    workouts: liste,
    sleepStages: stages,
  };
}

const vaultDir = process.argv[2];
if (!vaultDir) {
  console.error("Aufruf: node make-health-cache.mjs <vaultDir>");
  process.exit(1);
}

const cache = baueCache();
const ziel = join(vaultDir, ".obsidian", "plugins", PLUGIN_ID);
mkdirSync(ziel, { recursive: true });
writeFileSync(join(ziel, "health-cache.json"), JSON.stringify(cache));

const tageCount = ALLE.length;
console.log(
  `\n   health-cache.json: ${Object.keys(cache.metrics).length} Metriken, ${tageCount} Tage `
  + `(${VON} … ${BIS}), ${cache.workouts.length} Workouts, `
  + `${Object.keys(cache.sleepStages).length} Nächte — synthetisch, Seed fest`,
);
