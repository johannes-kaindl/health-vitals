// Schlaf ist die einzige Metrik, die sich nicht durch Aufaddieren ihrer Records
// aggregieren lässt. Apple exportiert für dieselbe Nacht mehrfach dieselbe Zeit:
//
//   1. `InBed` (Liegezeit) UMSCHLIESST die Phasen darin — beide zu addieren zählt
//      die Nacht doppelt.
//   2. Mehrere Quellen schreiben parallel: das iPhone meldet `InBed`, die Watch
//      gleichzeitig `Asleep*`, eine Drittanbieter-App nochmal beides.
//   3. Zwei Nächte fallen auf denselben Kalendertag, wenn man nach `startDate`
//      gruppiert — die Nacht, die morgens endet, und die, die abends beginnt.
//
// Am echten Export (21.711 Sleep-Records) ergab das bis zu 33,6 h "Schlaf" an einem
// Tag. Deshalb: Intervalle sammeln, je Nacht und Art VEREINIGEN statt summieren.

import { toEpochMs } from "./apple-date";

export type SleepKind = "inBed" | "asleep" | "awake";
export type SleepStage = "core" | "deep" | "rem" | "unspecified";

/** Der Record-Typ, den dieses Modul aus dem generischen Aggregat herauslöst. */
export const SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis";

/**
 * Die beiden abgeleiteten Serien. Bewusst OHNE `HK…`-Präfix: Sie stammen nicht
 * aus dem Export, sondern entstehen erst durch die Vereinigung — ein Identifier,
 * der wie ein Apple-Identifier aussieht, würde eine Herkunft behaupten, die es
 * nicht gibt. Sie sind gleichrangig: keiner ist "der" Schlafwert.
 */
export const METRIC_SLEEP_ASLEEP = "SleepAsleep";
export const METRIC_SLEEP_IN_BED = "SleepInBed";

/**
 * Ab dieser Wanduhr-Stunde zählt ein beginnender Schlaf auf den FOLGENDEN Tag —
 * eine Nacht gehört dem Tag, an dem man aufwacht (Konvention der Health-App).
 *
 * 20:00 ist nicht geraten, sondern an den Daten bestimmt: In den Beginnzeiten aller
 * 14.073 Asleep-Phasen ist 20 Uhr das globale Minimum (12 Beginne; 19h: 16, 21h: 101,
 * 22h: 327). Ein Cut-Off zerschneidet zwangsläufig laufende Phasen — bei 20:00 sind
 * es 3, bei 18:00 wären es 24. Der Wert gehört also dorthin, wo am wenigsten
 * passiert, nicht auf eine runde Zahl.
 */
export const NIGHT_CUTOFF_HOUR = 20;

export interface SleepRecordInput {
  /** Roher `value`-String, z. B. "HKCategoryValueSleepAnalysisAsleepDeep". */
  categoryValue: string;
  startDate: string;
  endDate: string;
}

export interface SleepNight {
  /** Kalendertag des Aufwachens, "YYYY-MM-DD". */
  day: string;
  /** Vereinigte Minuten echten Schlafs (alle Asleep-Phasen, quellenübergreifend). */
  asleepMin: number;
  /** Vereinigte Minuten im Bett, Schlafphasen eingeschlossen. Nie kleiner als `asleepMin`. */
  inBedMin: number;
  /** Vereinigte Minuten wacher Zeit innerhalb der Nacht. */
  awakeMin: number;
  /** Vereinigte Minuten je Schlafphase. Summe kann von `asleepMin` abweichen. */
  stages: Record<SleepStage, number>;
  /** Anzahl zugrunde liegender Records — für `DayBucket.count`. */
  count: number;
}

interface Interval { startMs: number; endMs: number; }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ordnet einen `value`-String einer Art und ggf. Phase zu. Bewusst auf Teilstrings
 * geprüft statt auf eine Liste bekannter Konstanten: Das Export-Schema ist
 * undokumentiert und wächst mit jeder watchOS-Version (`AsleepCore`/`REM`/`Deep` kamen
 * erst mit watchOS 9 zu `AsleepUnspecified` dazu). Ein künftiges `AsleepLight` soll als
 * Schlaf zählen und nicht stillschweigend aus der Nacht fallen.
 */
export function classifySleepValue(value: string): { kind: SleepKind; stage: SleepStage | null } | null {
  if (!value) return null;
  // Reihenfolge zählt: "Awake" vor "Asleep" prüfen wäre egal, "InBed" aber nicht —
  // es enthält keines der beiden, deshalb ist die Prüfung disjunkt.
  if (value.includes("InBed")) return { kind: "inBed", stage: null };
  if (value.includes("Awake")) return { kind: "awake", stage: null };
  if (!value.includes("Asleep")) return null;
  if (value.includes("Core")) return { kind: "asleep", stage: "core" };
  if (value.includes("Deep")) return { kind: "asleep", stage: "deep" };
  if (value.includes("REM")) return { kind: "asleep", stage: "rem" };
  return { kind: "asleep", stage: "unspecified" };
}

/** "YYYY-MM-DD" + n Tage, über Monats- und Jahresgrenzen hinweg. */
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + n * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Der Tag, dem eine um `startDate` beginnende Schlafphase zugerechnet wird.
 * Nutzt die Wanduhrzeit direkt (wie `localDay`) — der Zonen-Offset im Zeitstempel
 * beschreibt, wo der Nutzer war, nicht wann er nach eigenem Empfinden schlief.
 */
export function nightDayFor(startDate: string, cutoffHour: number = NIGHT_CUTOFF_HOUR): string {
  const day = startDate.slice(0, 10);
  if (!DAY_RE.test(day)) return day;
  const hour = Number(startDate.slice(11, 13));
  if (!Number.isFinite(hour)) return day;
  return hour >= cutoffHour ? addDays(day, 1) : day;
}

/**
 * Gesamtdauer der VEREINIGUNG überlappender Intervalle, in Minuten. Der Kern der
 * Entdopplung: Zeit, die von mehreren Records abgedeckt wird, zählt einmal.
 */
export function unionMinutes(intervals: readonly Interval[]): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let curStart = sorted[0].startMs;
  let curEnd = sorted[0].endMs;
  for (let i = 1; i < sorted.length; i++) {
    const iv = sorted[i];
    if (iv.startMs <= curEnd) {
      // Überlappend oder anschließend → Fenster erweitern, nicht addieren.
      if (iv.endMs > curEnd) curEnd = iv.endMs;
    } else {
      total += curEnd - curStart;
      curStart = iv.startMs;
      curEnd = iv.endMs;
    }
  }
  total += curEnd - curStart;
  return total / 60000;
}

/**
 * Sammelt Schlaf-Records über den ganzen Import und wertet sie erst am Ende aus.
 * Anders als beim übrigen Aggregator geht das nicht inkrementell: Ob zwei Intervalle
 * überlappen, steht erst fest, wenn beide bekannt sind — und die zweite Quelle kann
 * Millionen Records später im Dokument stehen. Bei ~22k Sleep-Records aus neun Jahren
 * ist das Halten unkritisch (die Sammlung wächst nicht mit der Dateigröße, sondern
 * mit der Zahl der Nächte).
 */
export class SleepCollector {
  private nights = new Map<string, { asleep: Interval[]; inBed: Interval[]; awake: Interval[]; stages: Map<SleepStage, Interval[]>; count: number }>();

  add(rec: SleepRecordInput): void {
    const cls = classifySleepValue(rec.categoryValue);
    if (!cls) return;
    const startMs = toEpochMs(rec.startDate);
    const endMs = toEpochMs(rec.endDate);
    // Unparsbare oder rückwärts laufende Zeitstempel würden die Vereinigung
    // verfälschen (ein negatives Intervall zieht die Summe nach unten).
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return;

    const day = nightDayFor(rec.startDate);
    if (!DAY_RE.test(day)) return;

    let n = this.nights.get(day);
    if (!n) {
      n = { asleep: [], inBed: [], awake: [], stages: new Map(), count: 0 };
      this.nights.set(day, n);
    }
    n.count++;
    const iv: Interval = { startMs, endMs };
    if (cls.kind === "inBed") n.inBed.push(iv);
    else if (cls.kind === "awake") n.awake.push(iv);
    else {
      n.asleep.push(iv);
      const stage = cls.stage ?? "unspecified";
      const list = n.stages.get(stage);
      if (list) list.push(iv);
      else n.stages.set(stage, [iv]);
    }
  }

  /** Alle Nächte, aufsteigend nach Tag. */
  finalize(): SleepNight[] {
    const out: SleepNight[] = [];
    for (const [day, n] of this.nights) {
      out.push({
        day,
        asleepMin: unionMinutes(n.asleep),
        // Liegezeit schließt die Schlafintervalle mit ein — wer schläft, liegt.
        // Ohne das wäre die Liegezeit in 23,8 % der Nächte KÜRZER als die Schlafzeit
        // (am echten Export gemessen): Die Watch meldet dann Phasen, für die das
        // iPhone keinen InBed-Record geschrieben hat. "5 h im Bett, 7 h geschlafen"
        // ist genauso unmöglich wie die 33,6-h-Nächte, die dieser Slice beseitigt —
        // nur unauffälliger. Die Vereinigung ist hier keine Annahme über fehlende
        // Daten, sondern die Auflösung eines Widerspruchs in den vorhandenen.
        inBedMin: unionMinutes([...n.inBed, ...n.asleep]),
        awakeMin: unionMinutes(n.awake),
        stages: {
          core: unionMinutes(n.stages.get("core") ?? []),
          deep: unionMinutes(n.stages.get("deep") ?? []),
          rem: unionMinutes(n.stages.get("rem") ?? []),
          unspecified: unionMinutes(n.stages.get("unspecified") ?? []),
        },
        count: n.count,
      });
    }
    out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    return out;
  }

  get size(): number {
    return this.nights.size;
  }
}
