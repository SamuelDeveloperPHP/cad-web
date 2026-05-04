import type { Point2D } from "./types";
import { distance } from "./vector";

/**
 * Calculates the length of a line given its start and end points.
 */
export function lineLength(start: Point2D, end: Point2D): number {
  return distance(start, end);
}

/**
 * Calculates the angle of a line in degrees (0 to 360).
 */
export function lineAngle(start: Point2D, end: Point2D): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) {
    angle += 360;
  }
  return angle;
}

/**
 * Calculates the area of a rectangle.
 */
export function rectangleArea(width: number, height: number): number {
  return Math.abs(width * height);
}

/**
 * Calculates the perimeter of a rectangle.
 */
export function rectanglePerimeter(width: number, height: number): number {
  return 2 * (Math.abs(width) + Math.abs(height));
}

/**
 * Calculates the area of a circle.
 */
export function circleArea(radius: number): number {
  return Math.PI * radius * radius;
}

/**
 * Calculates the circumference of a circle.
 */
export function circleCircumference(radius: number): number {
  return 2 * Math.PI * radius;
}
