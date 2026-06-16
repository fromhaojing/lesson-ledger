export function normalizeNumberWheelValue(value: string, min = 0, max = 10000) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return String(min);
  return String(Math.min(max, Math.max(min, parsed)));
}
