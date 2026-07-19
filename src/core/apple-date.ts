// Apple-Health-Zeitstempel: "YYYY-MM-DD HH:MM:SS ±HHMM" (Wanduhrzeit + Offset).

const TS_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;

/** Lokaler Kalendertag "YYYY-MM-DD" — die Wanduhrzeit ist bereits lokal. */
export function localDay(s: string): string {
  return s.slice(0, 10);
}

/** Epoch-Millisekunden (Offset eingerechnet); NaN bei unparsbarem Input. */
export function toEpochMs(s: string): number {
  const m = TS_RE.exec(s.trim());
  if (!m) return NaN;
  const [, Y, Mo, D, H, Mi, S, sign, oh, om] = m;
  const utc = Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S);
  const offsetMs = (sign === "+" ? 1 : -1) * (+oh * 60 + +om) * 60000;
  return utc - offsetMs;
}

/** Minuten zwischen zwei Zeitstempeln; 0 wenn einer unparsbar ist. */
export function durationMinutes(start: string, end: string): number {
  const a = toEpochMs(start);
  const b = toEpochMs(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return (b - a) / 60000;
}
