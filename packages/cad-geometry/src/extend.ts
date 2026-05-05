import { CAD_EPSILON, clamp } from "./constants";
import { distance } from "./vector";
import type { Point2D } from "./types";
import { cross, dot, subtractPoints } from "./vector";
import {
  rectangleEdgesAsLines,
  type LineParameterSegment,
  type TrimCircleEntity,
  type TrimCuttingEntity,
  type TrimLineEntity
} from "./trim";

export type ExtendEndpoint = "start" | "end";

export type LineLineExtendedIntersection = Readonly<{
  point: Point2D;
  targetParameter: number;
  boundaryParameter: number;
}>;

export type LineCircleExtendedIntersection = Readonly<{
  point: Point2D;
  targetParameter: number;
}>;

export type LineEndpointHit = Readonly<{
  endpoint: ExtendEndpoint;
  point: Point2D;
  distance: number;
}>;

export type ExtendCandidate = Readonly<{
  endpoint: ExtendEndpoint;
  point: Point2D;
  targetParameter: number;
  extensionDistance: number;
  boundaryType: TrimCuttingEntity["type"];
  boundaryId?: string;
}>;

export function lineLineIntersectionInfiniteWithSegmentBoundary(
  target: TrimLineEntity,
  boundary: TrimLineEntity,
  epsilon = CAD_EPSILON
): LineLineExtendedIntersection | null {
  const targetVector = subtractPoints(target.end, target.start);
  const boundaryVector = subtractPoints(boundary.end, boundary.start);
  const denominator = cross(targetVector, boundaryVector);

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const delta = subtractPoints(boundary.start, target.start);
  const targetParameter = cross(delta, boundaryVector) / denominator;
  const boundaryParameter = cross(delta, targetVector) / denominator;

  if (boundaryParameter < -epsilon || boundaryParameter > 1 + epsilon) {
    return null;
  }

  return {
    point: pointAtParameter(target, targetParameter),
    targetParameter,
    boundaryParameter: clamp(boundaryParameter, 0, 1)
  };
}

export function lineCircleIntersectionsExtended(
  target: TrimLineEntity,
  circle: TrimCircleEntity,
  epsilon = CAD_EPSILON
): ReadonlyArray<LineCircleExtendedIntersection> {
  const direction = subtractPoints(target.end, target.start);
  const fromCenter = subtractPoints(target.start, circle.center);
  const a = dot(direction, direction);

  if (a <= epsilon * epsilon || circle.radius < 0) {
    return [];
  }

  const b = 2 * dot(fromCenter, direction);
  const c = dot(fromCenter, fromCenter) - circle.radius * circle.radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < -epsilon) {
    return [];
  }

  if (Math.abs(discriminant) <= epsilon) {
    const targetParameter = -b / (2 * a);
    return [{ point: pointAtParameter(target, targetParameter), targetParameter }];
  }

  const root = Math.sqrt(Math.max(0, discriminant));
  const parameters = uniqueParameters([
    (-b - root) / (2 * a),
    (-b + root) / (2 * a)
  ], epsilon);

  return parameters.map((targetParameter) => ({
    point: pointAtParameter(target, targetParameter),
    targetParameter
  }));
}

export function getExtendCandidates(
  target: TrimLineEntity,
  boundaryEntities: ReadonlyArray<TrimCuttingEntity>,
  endpoint: ExtendEndpoint,
  epsilon = CAD_EPSILON
): ReadonlyArray<ExtendCandidate> {
  const candidates: ExtendCandidate[] = [];
  const targetLength = distance(target.start, target.end);

  if (targetLength <= epsilon) {
    return candidates;
  }

  for (const boundaryEntity of boundaryEntities) {
    if (boundaryEntity.id !== undefined && target.id !== undefined && boundaryEntity.id === target.id) {
      continue;
    }

    if (boundaryEntity.type === "line") {
      const intersection = lineLineIntersectionInfiniteWithSegmentBoundary(target, boundaryEntity, epsilon);
      addExtendCandidate(candidates, target, endpoint, intersection, targetLength, boundaryEntity.type, boundaryEntity.id, epsilon);
      continue;
    }

    if (boundaryEntity.type === "rectangle") {
      for (const edge of rectangleEdgesAsLines(boundaryEntity)) {
        const intersection = lineLineIntersectionInfiniteWithSegmentBoundary(target, edge, epsilon);
        addExtendCandidate(candidates, target, endpoint, intersection, targetLength, boundaryEntity.type, boundaryEntity.id, epsilon);
      }
      continue;
    }

    for (const intersection of lineCircleIntersectionsExtended(target, boundaryEntity, epsilon)) {
      addExtendCandidate(candidates, target, endpoint, intersection, targetLength, boundaryEntity.type, boundaryEntity.id, epsilon);
    }
  }

  return candidates.sort((a, b) => a.extensionDistance - b.extensionDistance);
}

export function findNearestExtendCandidate(
  candidates: ReadonlyArray<ExtendCandidate>
): ExtendCandidate | null {
  let nearest: ExtendCandidate | null = null;

  for (const candidate of candidates) {
    if (nearest === null || candidate.extensionDistance < nearest.extensionDistance) {
      nearest = candidate;
    }
  }

  return nearest;
}

export function extendLineToPoint(
  target: TrimLineEntity,
  endpoint: ExtendEndpoint,
  point: Point2D
): TrimLineEntity {
  return endpoint === "start"
    ? {
        ...target,
        start: point
      }
    : {
        ...target,
        end: point
      };
}

export function findLineEndpointNearPoint(
  target: TrimLineEntity,
  point: Point2D,
  toleranceWorld: number
): LineEndpointHit | null {
  const startDistance = distance(point, target.start);
  const endDistance = distance(point, target.end);
  const endpoint = startDistance <= endDistance ? "start" : "end";
  const nearestDistance = endpoint === "start" ? startDistance : endDistance;

  if (nearestDistance > toleranceWorld) {
    return null;
  }

  return {
    endpoint,
    point: endpoint === "start" ? target.start : target.end,
    distance: nearestDistance
  };
}

export function buildExtendPreview(
  target: TrimLineEntity,
  candidate: ExtendCandidate,
  epsilon = CAD_EPSILON
): LineParameterSegment | null {
  const start = candidate.endpoint === "start" ? candidate.point : target.end;
  const end = candidate.endpoint === "start" ? target.start : candidate.point;

  if (distance(start, end) <= epsilon) {
    return null;
  }

  return {
    type: "line",
    start,
    end,
    fromParameter: candidate.endpoint === "start" ? candidate.targetParameter : 1,
    toParameter: candidate.endpoint === "start" ? 0 : candidate.targetParameter
  };
}

function addExtendCandidate(
  candidates: ExtendCandidate[],
  target: TrimLineEntity,
  endpoint: ExtendEndpoint,
  intersection: Readonly<{ point: Point2D; targetParameter: number }> | null,
  targetLength: number,
  boundaryType: TrimCuttingEntity["type"],
  boundaryId: string | undefined,
  epsilon: number
): void {
  if (intersection === null) {
    return;
  }

  // O filtro aceita apenas interseções externas no sentido da ponta que será estendida.
  const parameterDelta = endpoint === "start"
    ? -intersection.targetParameter
    : intersection.targetParameter - 1;

  if (parameterDelta <= epsilon) {
    return;
  }

  if (candidates.some((candidate) => Math.abs(candidate.targetParameter - intersection.targetParameter) <= epsilon)) {
    return;
  }

  const candidate: ExtendCandidate = {
    endpoint,
    point: intersection.point,
    targetParameter: intersection.targetParameter,
    extensionDistance: parameterDelta * targetLength,
    boundaryType
  };

  candidates.push(boundaryId === undefined ? candidate : { ...candidate, boundaryId });
}

function pointAtParameter(line: TrimLineEntity, parameter: number): Point2D {
  return {
    x: line.start.x + (line.end.x - line.start.x) * parameter,
    y: line.start.y + (line.end.y - line.start.y) * parameter
  };
}

function uniqueParameters(parameters: ReadonlyArray<number>, epsilon: number): ReadonlyArray<number> {
  const ordered = parameters
    .filter((parameter) => Number.isFinite(parameter))
    .sort((a, b) => a - b);
  const unique: number[] = [];

  for (const parameter of ordered) {
    if (unique.every((existing) => Math.abs(existing - parameter) > epsilon)) {
      unique.push(parameter);
    }
  }

  return unique;
}
