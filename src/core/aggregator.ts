import { policyFor, type Policy } from "./aggregation-policy";
import { localDay, durationMinutes } from "./apple-date";
import type { HealthEvent } from "./health-parser";
import { SleepCollector, SLEEP_TYPE, METRIC_SLEEP_ASLEEP, METRIC_SLEEP_IN_BED } from "./sleep-session";
import type { DayBucket, HealthCache, MetricSeries, SleepStageDay, WorkoutEntry } from "./types";

interface MeasureAcc { min: number; max: number; sum: number; count: number; }
interface SumAcc { sum: number; count: number; }
interface DurAcc { minutes: number; count: number; }
type Acc = MeasureAcc | SumAcc | DurAcc;

interface SeriesAcc { unit: string; policy: Policy; daily: Map<string, Acc>; }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const round = (n: number): number => Math.round(n * 100) / 100;

export class Aggregator {
  private series = new Map<string, SeriesAcc>();
  private workouts: WorkoutEntry[] = [];
  private sleep = new SleepCollector();
  private recordCount = 0;
  private skippedCount = 0;
  private minDay: string | null = null;
  private maxDay: string | null = null;

  add(e: HealthEvent): void {
    if (e.kind === "workout") {
      this.workouts.push({
        type: e.activityType,
        start: e.startDate.slice(0, 16).replace(" ", "T"),
        durationMin: e.duration,
      });
      this.touchDay(localDay(e.startDate));
      return;
    }
    // Schlaf verlässt hier den generischen Weg. Sein Tagesaggregat ist keine Summe
    // von Record-Dauern, sondern die Vereinigung überlappender Intervalle je Nacht —
    // das lässt sich erst bilden, wenn alle Records gelesen sind (siehe sleep-session).
    if (e.type === SLEEP_TYPE) {
      // Falsy statt `=== null`: Ein Aufrufer, der das Feld gar nicht setzt, liefert
      // `undefined` — und der Typecheck deckt Testdateien nicht ab (tsconfig
      // `include` steht auf `src/**`), fängt so einen Aufrufer also nicht.
      if (!e.categoryValue) {
        this.skippedCount++;
        return;
      }
      this.recordCount++;
      this.sleep.add({
        categoryValue: e.categoryValue,
        startDate: e.startDate,
        endDate: e.endDate,
      });
      // Bewusst KEIN touchDay hier: Der Tagesbereich soll die Nächte spiegeln, die
      // die Vereinigung am Ende tatsächlich ausgibt — ein Record mit kaputtem
      // Zeitstempel wird dort verworfen und darf den Bereich nicht vorher aufziehen.
      return;
    }

    const policy = policyFor(e.type);
    if ((policy === "sum" || policy === "measure") && e.value === null) {
      this.skippedCount++;
      return;
    }
    this.recordCount++;
    const day = localDay(e.startDate);
    this.touchDay(day);

    let s = this.series.get(e.type);
    if (!s) { s = { unit: e.unit, policy, daily: new Map() }; this.series.set(e.type, s); }
    if (!s.unit && e.unit) s.unit = e.unit;

    if (policy === "sum") {
      const acc = (s.daily.get(day) as SumAcc) ?? { sum: 0, count: 0 };
      acc.sum += e.value as number;
      acc.count++;
      s.daily.set(day, acc);
    } else if (policy === "measure") {
      const v = e.value as number;
      const acc = (s.daily.get(day) as MeasureAcc) ?? { min: v, max: v, sum: 0, count: 0 };
      acc.min = Math.min(acc.min, v);
      acc.max = Math.max(acc.max, v);
      acc.sum += v;
      acc.count++;
      s.daily.set(day, acc);
    } else {
      const acc = (s.daily.get(day) as DurAcc) ?? { minutes: 0, count: 0 };
      acc.minutes += durationMinutes(e.startDate, e.endDate);
      acc.count++;
      s.daily.set(day, acc);
    }
  }

  private touchDay(day: string): void {
    if (!DAY_RE.test(day)) return;
    if (this.minDay === null || day < this.minDay) this.minDay = day;
    if (this.maxDay === null || day > this.maxDay) this.maxDay = day;
  }

  finalize(meta: { sourceFile: string; importedAt: string }): HealthCache {
    const metrics: Record<string, MetricSeries> = {};
    for (const [type, s] of this.series) {
      const daily: Record<string, DayBucket> = {};
      for (const [day, acc] of s.daily) {
        if (s.policy === "measure") {
          const m = acc as MeasureAcc;
          daily[day] = { min: m.min, max: m.max, avg: round(m.sum / m.count), count: m.count };
        } else if (s.policy === "sum") {
          const a = acc as SumAcc;
          daily[day] = { sum: round(a.sum), count: a.count };
        } else {
          const d = acc as DurAcc;
          daily[day] = { minutes: round(d.minutes), count: d.count };
        }
      }
      metrics[type] = { unit: s.unit, policy: s.policy, daily };
    }

    // Schlaf als zwei gleichrangige Serien: tatsächlich geschlafene Zeit und
    // Liegezeit. Keine der beiden ist "der" Schlafwert — sie beantworten
    // verschiedene Fragen und weichen regelmäßig um eine Stunde voneinander ab.
    const nights = this.sleep.finalize();
    if (nights.length > 0) {
      const asleep: Record<string, DayBucket> = {};
      const inBed: Record<string, DayBucket> = {};
      const stages: Record<string, SleepStageDay> = {};
      for (const n of nights) {
        this.touchDay(n.day);
        if (n.asleepMin > 0) asleep[n.day] = { minutes: round(n.asleepMin), count: n.count };
        if (n.inBedMin > 0) inBed[n.day] = { minutes: round(n.inBedMin), count: n.count };
        stages[n.day] = {
          core: round(n.stages.core),
          deep: round(n.stages.deep),
          rem: round(n.stages.rem),
          unspecified: round(n.stages.unspecified),
          awake: round(n.awakeMin),
        };
      }
      if (Object.keys(asleep).length > 0) {
        metrics[METRIC_SLEEP_ASLEEP] = { unit: "min", policy: "duration", daily: asleep };
      }
      if (Object.keys(inBed).length > 0) {
        metrics[METRIC_SLEEP_IN_BED] = { unit: "min", policy: "duration", daily: inBed };
      }
      this.sleepStages = stages;
    }

    return {
      version: 2,
      sourceFile: meta.sourceFile,
      importedAt: meta.importedAt,
      recordCount: this.recordCount,
      skippedCount: this.skippedCount,
      dateRange: this.minDay && this.maxDay ? { from: this.minDay, to: this.maxDay } : null,
      metrics,
      workouts: this.workouts,
      sleepStages: this.sleepStages,
    };
  }

  /** Phasen je Nacht — für den gestapelten Balken, nicht als eigene Metriken. */
  private sleepStages: Record<string, SleepStageDay> = {};
}
