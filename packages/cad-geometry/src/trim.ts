import { CAD_EPSILON, clamp } from "./constants";
import { distancePointToSegment } from "./distance";
import { rotationMatrix, transformPoint } from "./matrix";
import type { Point2D } from "./types";
import { cross, dot, subtractPoints } from "./vector";

export type TrimLineEntity = Readonly<{
  id?: string;
  type: "line";
  start: Point2D;
  end: Point2D;
}>;

export type TrimRectangleEntity = Readonly<{
  id?: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}>;

export type TrimCircleEntity = Readonly<{
  id?: string;
  type: "circle";
  center: Point2D;
  radius: number;
}>;

export type TrimCuttingEntity = TrimLineEntity | TrimRectangleEntity | TrimCircleEntity;

export type LineLineIntersection = Readonly<{
  point: Point2D;
  targetParameter: number;
  cuttingParameter: number;
}>;

export type LineCircleIntersection = Readonly<{
  point: Point2D;
  targetParameter: number;
}>;

export type LineParameterSegment = Readonly<{
  type: "line";
  start: Point2D;
  end: Point2D;
  fromParameter: number;
  toParameter: number;
}>;

export type TrimLineResult = Readonly<{
  cutParameters: ReadonlyArray<number>;
  resultLines: ReadonlyArray<LineParameterSegment>;
  removedSegment: LineParameterSegment | null;
  warnings: ReadonlyArray<string>;
  errors: ReadonlyArray<string>;
}>;

export function lineLineIntersection(
  target: TrimLineEntity,
  cutting: TrimLineEntity,
  epsilon = CAD_EPSILON
): LineLineIntersection | null {
  const targetVector = subtractPoints(target.end, target.start);
  const cuttingVector = subtractPoints(cutting.end, cutting.start);
  const denominator = cross(targetVector, cuttingVector);

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const delta = subtractPoints(cutting.start, target.start);
  const targetParameter = cross(delta, cuttingVector) / denominator;
  const cuttingParameter = cross(delta, targetVector) / denominator;

  if (!isSegmentParameter(targetParameter, epsilon) || !isSegmentParameter(cuttingParameter, epsilon)) {
    return null;
  }

  const clampedTargetParameter = clamp(targetParameter, 0, 1);
  const clampedCuttingParameter = clamp(cuttingParameter, 0, 1);

  return {
    point: pointAtParameter(target, clampedTargetParameter),
    targetParameter: clampedTargetParameter,
    cuttingParameter: clampedCuttingParameter
  };
}

export function lineCircleIntersections(
  target: TrimLineEntity,
  circle: TrimCircleEntity,
  epsilon = CAD_EPSILON
): ReadonlyArray<LineCircleIntersection> {
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
    const clampedParameter = clamp(targetParameter, 0, 1);
    return isSegmentParameter(targetParameter, epsilon)
      ? [{ point: pointAtParameter(target, clampedParameter), targetParameter: clampedParameter }]
      : [];
  }

  const root = Math.sqrt(Math.max(0, discriminant));
  const parameters = [
    (-b - root) / (2 * a),
    (-b + root) / (2 * a)
  ];

  return uniqueRawParameters(parameters, epsilon)
    .filter((targetParameter) => isSegmentParameter(targetParameter, epsilon))
    .map((targetParameter) => {
      const clampedParameter = clamp(targetParameter, 0, 1);
      return {
        point: pointAtParameter(target, clampedParameter),
        targetParameter: clampedParameter
      };
    });
}

export function rectangleEdgesAsLines(rectangle: TrimRectangleEntity): ReadonlyArray<TrimLineEntity> {
  const origin = { x: rectangle.x, y: rectangle.y };
  const corners = [
    origin,
    { x: rectangle.x + rectangle.width, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height },
    { x: rectangle.x, y: rectangle.y + rectangle.height }
  ];
  const transformedCorners = rectangle.rotation
    ? corners.map((corner) => transformPoint(corner, rotationMatrix(rectangle.rotation || 0, origin)))
    : corners;
  const [p0, p1, p2, p3] = transformedCorners as [Point2D, Point2D, Point2D, Point2D];

  return [
    createRectangleEdge(rectangle, p0, p1, 0),
    createRectangleEdge(rectangle, p1, p2, 1),
    createRectangleEdge(rectangle, p2, p3, 2),
    createRectangleEdge(rectangle, p3, p0, 3)
  ];
}

export function getLineCutParameters(
  target: TrimLineEntity,
  cuttingEntities: ReadonlyArray<TrimCuttingEntity>,
  epsilon = CAD_EPSILON
): ReadonlyArray<number> {
  // O coletor mantém apenas cortes internos para evitar segmentos degenerados nos extremos.
  const parameters: number[] = [];

  for (const cuttingEntity of cuttingEntities) {
    if (cuttingEntity.id !== undefined && target.id !== undefined && cuttingEntity.id === target.id) {
      continue;
    }

    if (cuttingEntity.type === "line") {
      const intersection = lineLineIntersection(target, cuttingEntity, epsilon);
      if (intersection !== null && isInternalParameter(intersection.targetParameter, epsilon)) {
        parameters.push(intersection.targetParameter);
      }
      continue;
    }

    if (cuttingEntity.type === "rectangle") {
      for (const edge of rectangleEdgesAsLines(cuttingEntity)) {
        const intersection = lineLineIntersection(target, edge, epsilon);
        if (intersection !== null && isInternalParameter(intersection.targetParameter, epsilon)) {
          parameters.push(intersection.targetParameter);
        }
      }
      continue;
    }

    for (const intersection of lineCircleIntersections(target, cuttingEntity, epsilon)) {
      if (isInternalParameter(intersection.targetParameter, epsilon)) {
        parameters.push(intersection.targetParameter);
      }
    }
  }

  return uniqueParameters(parameters, epsilon);
}

export function splitLineByParameters(
  target: TrimLineEntity,
  parameters: ReadonlyArray<number>,
  epsilon = CAD_EPSILON
): ReadonlyArray<LineParameterSegment> {
  const orderedParameters = [0, ...uniqueParameters(parameters, epsilon), 1]
    .filter((parameter) => Number.isFinite(parameter))
    .map((parameter) => clamp(parameter, 0, 1))
    .sort((a, b) => a - b);
  const segments: LineParameterSegment[] = [];

  for (let index = 0; index < orderedParameters.length - 1; index++) {
    const fromParameter = orderedParameters[index]!;
    const toParameter = orderedParameters[index + 1]!;

    if (toParameter - fromParameter <= epsilon) {
      continue;
    }

    segments.push({
      type: "line",
      start: pointAtParameter(target, fromParameter),
      end: pointAtParameter(target, toParameter),
      fromParameter,
      toParameter
    });
  }

  return segments;
}

export function findLineSegmentAtPoint(
  segments: ReadonlyArray<LineParameterSegment>,
  point: Point2D,
  toleranceWorld: number
): LineParameterSegment | null {
  let nearestSegment: LineParameterSegment | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const distance = distancePointToSegment(point, segment.start, segment.end);

    if (distance <= toleranceWorld && distance < nearestDistance) {
      nearestDistance = distance;
      nearestSegment = segment;
    }
  }

  return nearestSegment;
}

export function trimLineByClick(
  target: TrimLineEntity,
  cuttingEntities: ReadonlyArray<TrimCuttingEntity>,
  clickPoint: Point2D,
  toleranceWorld = CAD_EPSILON,
  epsilon = CAD_EPSILON
): TrimLineResult {
  // A rotina retorna o trecho removido separadamente para o renderer desenhar o preview.
  const cutParameters = getLineCutParameters(target, cuttingEntities, epsilon);
  const segments = splitLineByParameters(target, cutParameters, epsilon);
  const warnings: string[] = [];

  if (cutParameters.length === 0) {
    warnings.push("No valid cutting edge found.");
    return {
      cutParameters,
      resultLines: segments,
      removedSegment: null,
      warnings,
      errors: []
    };
  }

  const removedSegment = findLineSegmentAtPoint(segments, clickPoint, toleranceWorld);

  if (removedSegment === null) {
    warnings.push("No trim segment found at the picked point.");
    return {
      cutParameters,
      resultLines: segments,
      removedSegment: null,
      warnings,
      errors: []
    };
  }

  return {
    cutParameters,
    resultLines: segments.filter((segment) => segment !== removedSegment),
    removedSegment,
    warnings,
    errors: []
  };
}

function pointAtParameter(line: TrimLineEntity, parameter: number): Point2D {
  return {
    x: line.start.x + (line.end.x - line.start.x) * parameter,
    y: line.start.y + (line.end.y - line.start.y) * parameter
  };
}

function createRectangleEdge(
  rectangle: TrimRectangleEntity,
  start: Point2D,
  end: Point2D,
  index: number
): TrimLineEntity {
  const edge: TrimLineEntity = {
    type: "line",
    start,
    end
  };

  return rectangle.id === undefined
    ? edge
    : {
        ...edge,
        id: `${rectangle.id}_edge_${index}`
      };
}

function uniqueParameters(parameters: ReadonlyArray<number>, epsilon: number): ReadonlyArray<number> {
  const ordered = parameters
    .filter((parameter) => Number.isFinite(parameter))
    .map((parameter) => clamp(parameter, 0, 1))
    .sort((a, b) => a - b);
  const unique: number[] = [];

  for (const parameter of ordered) {
    if (unique.every((existing) => Math.abs(existing - parameter) > epsilon)) {
      unique.push(parameter);
    }
  }

  return unique;
}

function uniqueRawParameters(parameters: ReadonlyArray<number>, epsilon: number): ReadonlyArray<number> {
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

function isSegmentParameter(parameter: number, epsilon: number): boolean {
  return parameter >= -epsilon && parameter <= 1 + epsilon;
}

function isInternalParameter(parameter: number, epsilon: number): boolean {
  return parameter > epsilon && parameter < 1 - epsilon;
}
