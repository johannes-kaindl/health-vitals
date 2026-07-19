export function formatValue(n: number, unit: string): string {
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const num = rounded.toLocaleString("de-DE");
  return unit ? `${num} ${unit}` : num;
}

// Dauer in Minuten (evtl. mit Nachkommastellen) → lesbar: "X min" bzw. "Xh Ym".
export function formatDuration(min: number): string {
  const total = Math.round(min);
  if (total === 0) return min > 0 ? "< 1 min" : "0 min";
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}
