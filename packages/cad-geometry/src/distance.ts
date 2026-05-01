import { CAD_EPSILON, clamp } from "./constants";
import type { Point2D } from "./types";
import { distance, dot, subtractPoints } from "./vector";

export type ProjectionResult = Readonly<{
  point: Point2D;
  parameter: number;
  distance: number;
}>;

// A projecao limita o parametro ao segmento para servir ao snap nearest.
export function projectPointOnSegment(
  point: Point2D,
  segmentStart: Point2D,
  segmentEnd: Point2D,
  epsilon = CAD_EPSILON
): ProjectionResult {
  const segment = subtractPoints(segmentEnd, segmentStart);
  const segmentLengthSquared = dot(segment, segment);

  if (segmentLengthSquared <= epsilon * epsilon) {
    return {
      point: segmentStart,
      parameter: 0,
      distance: distance(point, segmentStart)
    };
  }

  const rawParameter = dot(subtractPoints(point, segmentStart), segment) / segmentLengthSquared;
  const parameter = clamp(rawParameter, 0, 1);
  const projectedPoint = {
    x: segmentStart.x + segment.x * parameter,
    y: segmentStart.y + segment.y * parameter
  };

  return {
    point: projectedPoint,
    parameter,
    distance: distance(point, projectedPoint)
  };
}

export function distancePointToSegment(point: Point2D, segmentStart: Point2D, segmentEnd: Point2D): number {
  return projectPointOnSegment(point, segmentStart, segmentEnd).distance;
}
