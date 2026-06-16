export const DEFAULT_NUMBER_WHEEL_MIN = 50;
export const DEFAULT_NUMBER_WHEEL_MAX = 500;
export const DEFAULT_NUMBER_WHEEL_STEP = 5;

export function normalizeNumberWheelValue(
  value: string,
  min = 0,
  max = 10000,
  step = 1,
) {
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return String(min);
  const clamped = Math.min(max, Math.max(min, parsed));
  const normalizedStep = Math.max(1, Math.round(step));
  const stepped =
    min + Math.round((clamped - min) / normalizedStep) * normalizedStep;
  return String(Math.min(max, Math.max(min, stepped)));
}
