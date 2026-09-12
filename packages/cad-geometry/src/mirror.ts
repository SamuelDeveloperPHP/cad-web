import { reflectionMatrix, transformPoint } from "./matrix";
import type { Point2D } from "./types";

/**
 * A função reflete um ponto em torno da reta definida por a e b.
 */
export function reflectPointAcrossLine(point: Point2D, a: Point2D, b: Point2D, epsilon = 1e-9): Point2D {
  return transformPoint(point, reflectionMatrix(a, b, epsilon));
}

/**
 * A função reflete um ângulo (em radianos) em torno de uma reta com o ângulo axisAngle.
 * A reflexão de uma direção θ em torno de uma reta com direção φ resulta em 2φ − θ.
 */
export function reflectAngleAcrossAxis(angle: number, axisAngle: number): number {
  return 2 * axisAngle - angle;
}

/**
 * A função devolve o ângulo, em radianos, da reta orientada de a para b.
 */
export function axisAngleBetween(a: Point2D, b: Point2D): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}
