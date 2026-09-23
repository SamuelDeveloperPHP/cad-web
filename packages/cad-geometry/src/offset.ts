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

/**
 * Offset de um arco circular: mesmo centro e ângulos, raio aumentado (lado de fora) ou reduzido (lado de dentro).
 */
export function offsetArc<T extends Readonly<{ center: Point2D; radius: number }>>(
  arc: T,
  offsetDistance: number,
  sidePoint: Point2D
): T | null {
  if (offsetDistance <= 0) return null;

  const isExternal = distance(sidePoint, arc.center) >= arc.radius;
  const newRadius = isExternal ? arc.radius + offsetDistance : arc.radius - offsetDistance;

  return newRadius > 0 ? { ...arc, radius: newRadius } : null;
}

export type EllipseOffsetInput = Readonly<{
  center: Point2D;
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}>;

export type EllipseOffsetResult = Readonly<{
  points: ReadonlyArray<Point2D>;
  closed: boolean;
}>;

/**
 * Offset de elipse ou arco de elipse. A curva paralela a uma elipse não é uma elipse (o AutoCAD gera
 * uma spline); aqui ela é amostrada em uma polyline densa: P(t) ± d·N(t), com N a normal unitária externa.
 * O lado vem do ponto indicado (fora da elipse = para fora). Para dentro, a distância precisa ser menor
 * que o menor raio de curvatura (b²/a); acima disso a curva paralela forma laços e o offset é recusado.
 */
export function offsetEllipse(
  ellipse: EllipseOffsetInput,
  offsetDistance: number,
  sidePoint: Point2D,
  maxChordError = Math.max(ellipse.radiusX, ellipse.radiusY) * 1e-4
): EllipseOffsetResult | null {
  if (offsetDistance <= 0) return null;

  const a = ellipse.radiusX;
  const b = ellipse.radiusY;
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  const localSide = {
    x: ((sidePoint.x - ellipse.center.x) * cos + (sidePoint.y - ellipse.center.y) * sin) / a,
    y: (-(sidePoint.x - ellipse.center.x) * sin + (sidePoint.y - ellipse.center.y) * cos) / b
  };
  const outward = localSide.x * localSide.x + localSide.y * localSide.y >= 1;
  const minCurvatureRadius = Math.min(a, b) ** 2 / Math.max(a, b);

  if (!outward && offsetDistance >= minCurvatureRadius) {
    return null;
  }

  const signed = outward ? offsetDistance : -offsetDistance;
  const isArc = ellipse.startAngle !== undefined && ellipse.endAngle !== undefined;
  const start = isArc ? ellipse.startAngle! : 0;
  let sweep = isArc ? (ellipse.endAngle! - ellipse.startAngle!) % (Math.PI * 2) : Math.PI * 2;
  if (sweep <= 1e-12) sweep += Math.PI * 2;

  // Quantidade de amostras para o erro de corda ficar abaixo do limite no ponto de maior curvatura.
  const maxRadius = Math.max(a, b) + Math.abs(signed);
  const minRadius = Math.max(minCurvatureRadius + signed, 1e-9);
  const stepAngle = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - maxChordError / minRadius)));
  const byCurvature = Math.ceil((sweep * maxRadius) / Math.max(minRadius * stepAngle, 1e-9));
  const samples = Math.min(2048, Math.max(isArc ? 16 : 64, byCurvature));
  const points: Point2D[] = [];
  const count = isArc ? samples + 1 : samples;

  for (let index = 0; index < count; index += 1) {
    const t = start + (sweep * index) / samples;
    const localX = a * Math.cos(t);
    const localY = b * Math.sin(t);
    // Normal externa (não normalizada) da elipse local: (b·cos t, a·sin t).
    const nx = b * Math.cos(t);
    const ny = a * Math.sin(t);
    const nLength = Math.hypot(nx, ny);
    const offsetX = localX + (signed * nx) / nLength;
    const offsetY = localY + (signed * ny) / nLength;

    points.push({
      x: ellipse.center.x + offsetX * cos - offsetY * sin,
      y: ellipse.center.y + offsetX * sin + offsetY * cos
    });
  }

  return { points, closed: !isArc };
}
