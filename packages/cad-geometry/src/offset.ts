import type { CircleGeometry, LineGeometry, Point2D, RectangleGeometry } from "./types";
import { addVector, distance, dot, normalize, perpendicularLeft, scaleVector, subtractPoints } from "./vector";
import { rotationMatrix, transformPoint } from "./matrix";

/**
 * Calculates the offset of a line.
 * @param line The original line to offset.
 * @param offsetDistance The positive distance to offset.
 * @param sidePoint A point indicating which side to offset to.
 * @returns A new line geometry, or null if distance is invalid.
 */
export function offsetLine(
  line: Omit<LineGeometry, "id">,
  offsetDistance: number,
  sidePoint: Point2D
): Omit<LineGeometry, "id"> | null {
  if (offsetDistance <= 0) return null;

  const start = line.start;
  const end = line.end;

  const dir = subtractPoints(end, start);
  const leftNormal = normalize(perpendicularLeft(dir));

  const pointVec = subtractPoints(sidePoint, start);
  const dotProd = dot(pointVec, leftNormal);

  // If dotProd > 0, sidePoint is on the left. If < 0, it is on the right.
  // If exactly 0, we can default to left.
  const sign = dotProd >= 0 ? 1 : -1;
  const offsetVec = scaleVector(leftNormal, sign * offsetDistance);

  return {
    type: "line",
    start: addVector(start, offsetVec),
    end: addVector(end, offsetVec)
  };
}

/**
 * Calculates the offset of a circle.
 * @param circle The original circle to offset.
 * @param offsetDistance The positive distance to offset.
 * @param sidePoint A point indicating which side to offset to.
 * @returns A new circle geometry, or null if the resulting radius is invalid.
 */
export function offsetCircle(
  circle: Omit<CircleGeometry, "id">,
  offsetDistance: number,
  sidePoint: Point2D
): Omit<CircleGeometry, "id"> | null {
  if (offsetDistance <= 0) return null;

  const distToCenter = distance(sidePoint, circle.center);
  const isExternal = distToCenter >= circle.radius;

  const newRadius = isExternal
    ? circle.radius + offsetDistance
    : circle.radius - offsetDistance;

  if (newRadius <= 0) return null;

  return {
    type: "circle",
    center: circle.center,
    radius: newRadius
  };
}

/**
 * Calculates the offset of a rectangle.
 * @param rect The original rectangle to offset.
 * @param offsetDistance The positive distance to offset.
 * @param sidePoint A point indicating which side to offset to.
 * @returns A new rectangle geometry, or null if the resulting dimensions are invalid.
 */
export function offsetRectangle(
  rect: Omit<RectangleGeometry, "id">,
  offsetDistance: number,
  sidePoint: Point2D
): Omit<RectangleGeometry, "id"> | null {
  if (offsetDistance <= 0) return null;

  // Transform sidePoint to the rectangle's local coordinate system (unrotated, origin at 0,0)
  const pivot = rect.origin;
  const rotAngle = rect.rotation || 0;

  // Forward rotation is `rotAngle` around `pivot`.
  // Inverse rotation is `-rotAngle` around `pivot`.
  const invMatrix = rotationMatrix(-rotAngle, pivot);
  const localPoint = transformPoint(sidePoint, invMatrix);

  // In local space, the rectangle spans from pivot.x to pivot.x + width, and pivot.y to pivot.y + height.
  // We can just translate it so origin is 0,0
  const px = localPoint.x - pivot.x;
  const py = localPoint.y - pivot.y;

  const isInside = px >= 0 && px <= rect.width && py >= 0 && py <= rect.height;

  let newWidth: number;
  let newHeight: number;
  let localOriginDisp: Point2D;

  if (isInside) {
    newWidth = rect.width - 2 * offsetDistance;
    newHeight = rect.height - 2 * offsetDistance;
    localOriginDisp = { x: offsetDistance, y: offsetDistance };
  } else {
    newWidth = rect.width + 2 * offsetDistance;
    newHeight = rect.height + 2 * offsetDistance;
    localOriginDisp = { x: -offsetDistance, y: -offsetDistance };
  }

  if (newWidth <= 0 || newHeight <= 0) return null;

  // The local origin displacement must be rotated back to global space.
  // Wait, localOriginDisp is a vector from the original origin to the new origin in local coordinates.
  // To get the global vector, we rotate it by `rotAngle`.
  const rotOriginMatrix = rotationMatrix(rotAngle, { x: 0, y: 0 });
  const globalDisp = transformPoint(localOriginDisp, rotOriginMatrix);

  const newOrigin = addVector(pivot, globalDisp);

  return {
    type: "rectangle",
    origin: newOrigin,
    width: newWidth,
    height: newHeight,
    rotation: rotAngle
  };
}
