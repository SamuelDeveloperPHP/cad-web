export type Point2D = Readonly<{
  x: number;
  y: number;
}>;

export type Vector2D = Readonly<{
  x: number;
  y: number;
}>;

export const CAD_EPSILON = 1e-9;

export function nearlyEqual(a: number, b: number, epsilon = CAD_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

export function pointsNearlyEqual(a: Point2D, b: Point2D, epsilon = CAD_EPSILON): boolean {
  return nearlyEqual(a.x, b.x, epsilon) && nearlyEqual(a.y, b.y, epsilon);
}

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function addVector(point: Point2D, vector: Vector2D): Point2D {
  return {
    x: point.x + vector.x,
    y: point.y + vector.y
  };
}

export function subtractPoints(a: Point2D, b: Point2D): Vector2D {
  return {
    x: a.x - b.x,
    y: a.y - b.y
  };
}
