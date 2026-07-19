export function formatValue(n: number, unit: string): string {
  const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  const num = rounded.toLocaleString("de-DE");
  return unit ? `${num} ${unit}` : num;
}
