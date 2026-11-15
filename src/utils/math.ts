/** Restricts `value` to the inclusive range [min, max]. NaN becomes `min`. */
export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}
