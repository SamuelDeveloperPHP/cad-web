import { CAD_EPSILON, nearlyEqual } from "./constants";
import type { Point2D, Vector2D } from "./types";

export function point(x: number, y: number): Point2D {
  return { x, y };
}

export function vector(x: number, y: number): Vector2D {
  return { x, y };
}

export function pointsNearlyEqual(a: Point2D, b: Point2D, epsilon = CAD_EPSILON): boolean {
  return nearlyEqual(a.x, b.x, epsilon) && nearlyEqual(a.y, b.y, epsilon);
}

export function addVector(point2D: Point2D, vector2D: Vector2D): Point2D {
  return {
    x: point2D.x + vector2D.x,
    y: point2D.y + vector2D.y
  };
}

export function subtractVector(point2D: Point2D, vector2D: Vector2D): Point2D {
  return {
    x: point2D.x - vector2D.x,
    y: point2D.y - vector2D.y
  };
}

export function subtractPoints(a: Point2D, b: Point2D): Vector2D {
  return {
    x: a.x - b.x,
    y: a.y - b.y
  };
}

export function addVectors(a: Vector2D, b: Vector2D): Vector2D {
  return {
    x: a.x + b.x,
    y: a.y + b.y
  };
}

export function scaleVector(vector2D: Vector2D, factor: number): Vector2D {
  return {
    x: vector2D.x * factor,
    y: vector2D.y * factor
  };
}

export function dot(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vector2D, b: Vector2D): number {
  return a.x * b.y - a.y * b.x;
}

export function length(vector2D: Vector2D): number {
  return Math.hypot(vector2D.x, vector2D.y);
}

export function distance(a: Point2D, b: Point2D): number {
  return length(subtractPoints(b, a));
}

export function normalize(vector2D: Vector2D, epsilon = CAD_EPSILON): Vector2D {
  const vectorLength = length(vector2D);

  if (vectorLength <= epsilon) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector2D.x / vectorLength,
    y: vector2D.y / vectorLength
  };
}

export function perpendicularLeft(vector2D: Vector2D): Vector2D {
  return {
    x: -vector2D.y,
    y: vector2D.x
  };
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

export function angleBetweenVectors(a: Vector2D, b: Vector2D): number {
  const dotProd = dot(a, b);
  const det = cross(a, b);
  return Math.atan2(det, dotProd);
}

export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a < 0) {
    a += 2 * Math.PI;
  }
  return a;
}

export function intersectInfiniteLines(
  p1: Point2D,
  p2: Point2D,
  p3: Point2D,
  p4: Point2D,
  epsilon = CAD_EPSILON
): Point2D | null {
  const a1 = p2.y - p1.y;
  const b1 = p1.x - p2.x;
  const c1 = a1 * p1.x + b1 * p1.y;

  const a2 = p4.y - p3.y;
  const b2 = p3.x - p4.x;
  const c2 = a2 * p3.x + b2 * p3.y;

  const determinant = a1 * b2 - a2 * b1;

  if (Math.abs(determinant) < epsilon) {
    return null; // Paralelas ou colineares
  }

  const x = (b2 * c1 - b1 * c2) / determinant;
  const y = (a1 * c2 - a2 * c1) / determinant;

  return { x, y };
}
