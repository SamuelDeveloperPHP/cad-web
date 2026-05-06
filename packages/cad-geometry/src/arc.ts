import { boundingBoxFromPoints } from "./bounding-box";
import { CAD_EPSILON, clamp } from "./constants";
import type { ArcGeometry, BoundingBox, LineGeometry, Point2D, Vector2D } from "./types";
import { cross, distance, dot, normalize, subtractPoints } from "./vector";

const FULL_CIRCLE = Math.PI * 2;

export type FilletLineEntity = Readonly<{
  id?: string;
  type: "line";
  start: Point2D;
  end: Point2D;
}>;

export type FilletArcGeometry = ArcGeometry;

export type ComputeLineLineFilletInput = Readonly<{
  line1: FilletLineEntity;
  line2: FilletLineEntity;
  radius: number;
  pickPoint1: Point2D;
  pickPoint2: Point2D;
  tolerance?: number;
}>;

export type ComputeLineLineFilletResult =
  | Readonly<{
      ok: true;
      line1Result: LineGeometry;
      line2Result: LineGeometry;
      arc: FilletArcGeometry;
      tangentPoint1: Point2D;
      tangentPoint2: Point2D;
      center: Point2D;
      radius: number;
      startAngle: number;
      endAngle: number;
      clockwise: boolean;
    }>
  | Readonly<{
      ok: false;
      reason: string;
    }>;

type BranchChoice = Readonly<{
  direction: Vector2D;
  updateEndpoint: "start" | "end";
  length: number;
}>;

export function buildArcFromCenterRadiusAngles(
  center: Point2D,
  radius: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean
): ArcGeometry {
  return {
    type: "arc",
    center,
    radius,
    startAngle,
    endAngle,
    clockwise
  };
}

export function arcPointAtAngle(center: Point2D, radius: number, angle: number): Point2D {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}

export function arcStartPoint(arc: ArcGeometry): Point2D {
  return arcPointAtAngle(arc.center, arc.radius, arc.startAngle);
}

export function arcEndPoint(arc: ArcGeometry): Point2D {
  return arcPointAtAngle(arc.center, arc.radius, arc.endAngle);
}

export function normalizeArcAngle(angle: number): number {
  const normalized = angle % FULL_CIRCLE;

  return normalized < 0 ? normalized + FULL_CIRCLE : normalized;
}

export function arcSweepAngle(startAngle: number, endAngle: number, clockwise: boolean): number {
  return clockwise
    ? normalizeArcAngle(endAngle - startAngle)
    : normalizeArcAngle(startAngle - endAngle);
}

export function isAngleOnArc(
  angle: number,
  startAngle: number,
  endAngle: number,
  clockwise: boolean,
  epsilon = CAD_EPSILON
): boolean {
  const sweep = arcSweepAngle(startAngle, endAngle, clockwise);
  const angleSweep = clockwise
    ? normalizeArcAngle(angle - startAngle)
    : normalizeArcAngle(startAngle - angle);

  return angleSweep <= sweep + epsilon;
}

export function arcBoundingBox(arc: ArcGeometry, epsilon = CAD_EPSILON): BoundingBox {
  const points: Point2D[] = [
    arcStartPoint(arc),
    arcEndPoint(arc)
  ];

  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    if (isAngleOnArc(angle, arc.startAngle, arc.endAngle, arc.clockwise, epsilon)) {
      points.push(arcPointAtAngle(arc.center, arc.radius, angle));
    }
  }

  return boundingBoxFromPoints(points);
}

export function distancePointToArc(
  point: Point2D,
  arc: ArcGeometry,
  epsilon = CAD_EPSILON
): number {
  const angle = Math.atan2(point.y - arc.center.y, point.x - arc.center.x);

  if (isAngleOnArc(angle, arc.startAngle, arc.endAngle, arc.clockwise, epsilon)) {
    return Math.abs(distance(point, arc.center) - arc.radius);
  }

  return Math.min(distance(point, arcStartPoint(arc)), distance(point, arcEndPoint(arc)));
}

export function nearestPointOnArc(
  point: Point2D,
  arc: ArcGeometry,
  epsilon = CAD_EPSILON
): Point2D {
  const vector = subtractPoints(point, arc.center);
  const direction = normalize(vector, epsilon);
  const safeDirection = Math.hypot(direction.x, direction.y) <= epsilon ? { x: 1, y: 0 } : direction;
  const projectedAngle = Math.atan2(safeDirection.y, safeDirection.x);

  if (isAngleOnArc(projectedAngle, arc.startAngle, arc.endAngle, arc.clockwise, epsilon)) {
    return {
      x: arc.center.x + safeDirection.x * arc.radius,
      y: arc.center.y + safeDirection.y * arc.radius
    };
  }

  const start = arcStartPoint(arc);
  const end = arcEndPoint(arc);

  return distance(point, start) <= distance(point, end) ? start : end;
}

export function computeLineLineFillet(input: ComputeLineLineFilletInput): ComputeLineLineFilletResult {
  const tolerance = input.tolerance ?? CAD_EPSILON;

  if (!Number.isFinite(input.radius) || input.radius <= tolerance) {
    return { ok: false, reason: "Radius must be greater than zero." };
  }

  const intersection = intersectInfiniteLineGeometries(input.line1, input.line2, tolerance);

  if (intersection === null) {
    return { ok: false, reason: "Lines are parallel or invalid." };
  }

  const branch1 = chooseFilletBranch(input.line1, intersection, input.pickPoint1, tolerance);
  const branch2 = chooseFilletBranch(input.line2, intersection, input.pickPoint2, tolerance);

  if (branch1 === null || branch2 === null) {
    return { ok: false, reason: "Lines are invalid." };
  }

  const angleCos = clamp(dot(branch1.direction, branch2.direction), -1, 1);
  const angle = Math.acos(angleCos);

  if (angle <= tolerance || Math.abs(Math.PI - angle) <= tolerance) {
    return { ok: false, reason: "Lines are parallel or invalid." };
  }

  const tangentDistance = input.radius / Math.tan(angle / 2);

  if (!Number.isFinite(tangentDistance) || tangentDistance <= tolerance) {
    return { ok: false, reason: "Radius too large or invalid." };
  }

  if (tangentDistance > branch1.length + tolerance || tangentDistance > branch2.length + tolerance) {
    return { ok: false, reason: "Radius too large or invalid." };
  }

  const tangentPoint1 = addScaledVector(intersection, branch1.direction, tangentDistance);
  const tangentPoint2 = addScaledVector(intersection, branch2.direction, tangentDistance);
  const bisector = normalize({
    x: branch1.direction.x + branch2.direction.x,
    y: branch1.direction.y + branch2.direction.y
  }, tolerance);

  if (Math.hypot(bisector.x, bisector.y) <= tolerance) {
    return { ok: false, reason: "Lines are parallel or invalid." };
  }

  const centerDistance = input.radius / Math.sin(angle / 2);
  const center = addScaledVector(intersection, bisector, centerDistance);
  const startAngle = Math.atan2(tangentPoint1.y - center.y, tangentPoint1.x - center.x);
  const endAngle = Math.atan2(tangentPoint2.y - center.y, tangentPoint2.x - center.x);
  const clockwiseSweep = arcSweepAngle(startAngle, endAngle, true);
  const counterClockwiseSweep = arcSweepAngle(startAngle, endAngle, false);
  const clockwise = clockwiseSweep <= counterClockwiseSweep;
  const arc = buildArcFromCenterRadiusAngles(center, input.radius, startAngle, endAngle, clockwise);

  return {
    ok: true,
    line1Result: updateLineEndpoint(input.line1, branch1.updateEndpoint, tangentPoint1),
    line2Result: updateLineEndpoint(input.line2, branch2.updateEndpoint, tangentPoint2),
    arc,
    tangentPoint1,
    tangentPoint2,
    center,
    radius: input.radius,
    startAngle,
    endAngle,
    clockwise
  };
}

function intersectInfiniteLineGeometries(
  line1: FilletLineEntity,
  line2: FilletLineEntity,
  epsilon: number
): Point2D | null {
  const direction1 = subtractPoints(line1.end, line1.start);
  const direction2 = subtractPoints(line2.end, line2.start);
  const denominator = cross(direction1, direction2);

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const delta = subtractPoints(line2.start, line1.start);
  const parameter = cross(delta, direction2) / denominator;

  return addScaledVector(line1.start, direction1, parameter);
}

function chooseFilletBranch(
  line: FilletLineEntity,
  vertex: Point2D,
  pickPoint: Point2D,
  epsilon: number
): BranchChoice | null {
  const distanceToStart = distance(pickPoint, line.start);
  const distanceToEnd = distance(pickPoint, line.end);
  const pickedEndpoint = distanceToStart <= distanceToEnd ? "start" : "end";
  const endpointPoint = pickedEndpoint === "start" ? line.start : line.end;
  const selectedVector = subtractPoints(endpointPoint, vertex);
  const direction = normalize(selectedVector, epsilon);
  const selectedLength = Math.hypot(selectedVector.x, selectedVector.y);

  if (Math.hypot(direction.x, direction.y) <= epsilon) {
    const otherEndpoint = pickedEndpoint === "start" ? line.end : line.start;
    const fallbackVector = subtractPoints(otherEndpoint, vertex);
    const fallbackDirection = normalize(fallbackVector, epsilon);
    const fallbackLength = Math.hypot(fallbackVector.x, fallbackVector.y);

    if (Math.hypot(fallbackDirection.x, fallbackDirection.y) <= epsilon) {
      return null;
    }

    return {
      direction: fallbackDirection,
      updateEndpoint: pickedEndpoint,
      length: fallbackLength
    };
  }

  // O fillet preserva o ramo selecionado e move a extremidade oposta ate o ponto tangente.
  return {
    direction,
    updateEndpoint: pickedEndpoint === "start" ? "end" : "start",
    length: selectedLength
  };
}

function updateLineEndpoint(line: FilletLineEntity, endpoint: "start" | "end", point: Point2D): LineGeometry {
  return endpoint === "start"
    ? {
        ...line,
        type: "line",
        start: point
      }
    : {
        ...line,
        type: "line",
        end: point
      };
}

function addScaledVector(point: Point2D, vector: Vector2D, scale: number): Point2D {
  return {
    x: point.x + vector.x * scale,
    y: point.y + vector.y * scale
  };
}
