export const CAD_EPSILON = 1e-9;

export const DEFAULT_TOLERANCE: ToleranceConfig = {
  distance: CAD_EPSILON,
  angle: 1e-10
};

export type ToleranceConfig = Readonly<{
  distance: number;
  angle: number;
}>;

export function nearlyEqual(a: number, b: number, epsilon = CAD_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
