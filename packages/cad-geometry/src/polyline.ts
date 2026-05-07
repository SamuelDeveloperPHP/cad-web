import { boundingBoxFromPoints } from "./bounding-box";
import { CAD_EPSILON } from "./constants";
import { projectPointOnSegment } from "./distance";
import type { BoundingBox, Matrix2D, Point2D, SegmentGeometry, Vector2D } from "./types";
import { distance, midpoint, normalize, subtractPoints } from "./vector";
import { transformPoint } from "./matrix";

// O modulo expoe utilidades puras para polylines (sequencias de segmentos retos), servindo
// como fundacao para Path Foundation: array por caminho, offset, trim, fillet e outras ferramentas futuras.
// As funcoes nao dependem do React, do renderer nem do command pattern.

export type PolylinePath = Readonly<{
  points: ReadonlyArray<Point2D>;
  closed: boolean;
}>;

export type PolylineSampleResult = Readonly<{
  point: Point2D;
  segmentIndex: number;
  tangent: Vector2D;
  distanceAlong: number;
}>;

export function isValidPolyline(points: ReadonlyArray<Point2D>, closed: boolean): boolean {
  // O metodo valida o numero minimo de vertices: 2 para aberta e 3 para fechada.
  if (!Array.isArray(points)) {
    return false;
  }

  const minVertices = closed ? 3 : 2;

  if (points.length < minVertices) {
    return false;
  }

  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return false;
    }
  }

  return true;
}

export function normalizePolylinePoints(
  points: ReadonlyArray<Point2D>,
  tolerance = CAD_EPSILON
): ReadonlyArray<Point2D> {
  // O metodo remove vertices duplicados consecutivos dentro da tolerancia, preservando o primeiro.
  const result: Point2D[] = [];

  for (const point of points) {
    const last = result[result.length - 1];

    if (last === undefined || distance(last, point) > tolerance) {
      result.push(point);
    }
  }

  return result;
}

export function polylineToSegments(polyline: PolylinePath): ReadonlyArray<SegmentGeometry> {
  // O metodo expande a polyline em segmentos sucessivos; quando closed, adiciona o segmento de fechamento.
  if (polyline.points.length < 2) {
    return [];
  }

  const segments: SegmentGeometry[] = [];

  for (let index = 0; index < polyline.points.length - 1; index += 1) {
    const start = polyline.points[index];
    const end = polyline.points[index + 1];
    if (start && end) {
      segments.push({ type: "segment", start, end });
    }
  }

  if (polyline.closed && polyline.points.length >= 3) {
    const last = polyline.points[polyline.points.length - 1];
    const first = polyline.points[0];

    if (last && first) {
      segments.push({ type: "segment", start: last, end: first });
    }
  }

  return segments;
}

export function getPolylineBoundingBox(polyline: PolylinePath): BoundingBox {
  // O calculo cobre todos os vertices; segmentos retos nunca extrapolam o envoltorio dos vertices.
  return boundingBoxFromPoints(polyline.points);
}

export function getPolylineSegmentLengths(polyline: PolylinePath): ReadonlyArray<number> {
  // O metodo retorna o comprimento de cada segmento na ordem em que apareceram em polylineToSegments.
  return polylineToSegments(polyline).map((segment) => distance(segment.start, segment.end));
}

export function getPolylineLength(polyline: PolylinePath): number {
  // O comprimento total e a soma dos segmentos, considerando o segmento de fechamento quando closed.
  let total = 0;

  for (const length of getPolylineSegmentLengths(polyline)) {
    total += length;
  }

  return total;
}

export function getPointAtPolylineDistance(polyline: PolylinePath, distanceAlong: number): PolylineSampleResult | null {
  // O sampling caminha pelos segmentos consumindo distancia ate encontrar o ponto solicitado.
  const segments = polylineToSegments(polyline);

  if (segments.length === 0) {
    return null;
  }

  const totalLength = getPolylineLength(polyline);

  if (totalLength <= 0) {
    return null;
  }

  const clampedDistance = clampDistance(distanceAlong, totalLength, polyline.closed);
  let consumed = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      continue;
    }

    const segmentLength = distance(segment.start, segment.end);

    if (segmentLength <= 0) {
      continue;
    }

    if (consumed + segmentLength >= clampedDistance) {
      const localDistance = clampedDistance - consumed;
      const t = localDistance / segmentLength;
      const point: Point2D = {
        x: segment.start.x + (segment.end.x - segment.start.x) * t,
        y: segment.start.y + (segment.end.y - segment.start.y) * t
      };
      const tangent = normalize(subtractPoints(segment.end, segment.start));

      return {
        point,
        segmentIndex: index,
        tangent,
        distanceAlong: clampedDistance
      };
    }

    consumed += segmentLength;
  }

  // O fallback usa o ultimo segmento; protege contra falhas de arredondamento no acumulado.
  const lastSegment = segments[segments.length - 1];

  if (lastSegment === undefined) {
    return null;
  }

  const tangent = normalize(subtractPoints(lastSegment.end, lastSegment.start));

  return {
    point: lastSegment.end,
    segmentIndex: segments.length - 1,
    tangent,
    distanceAlong: totalLength
  };
}

export function getPointAtPolylineT(polyline: PolylinePath, t: number): PolylineSampleResult | null {
  // O parametro t e mapeado em [0, 1] para a distancia equivalente no comprimento total.
  const totalLength = getPolylineLength(polyline);

  if (totalLength <= 0) {
    return null;
  }

  const clamped = polyline.closed ? wrapT(t) : clampT(t);
  return getPointAtPolylineDistance(polyline, clamped * totalLength);
}

export function getTangentAtPolylineDistance(polyline: PolylinePath, distanceAlong: number): Vector2D | null {
  const sample = getPointAtPolylineDistance(polyline, distanceAlong);
  return sample === null ? null : sample.tangent;
}

export function getTangentAtPolylineT(polyline: PolylinePath, t: number): Vector2D | null {
  const sample = getPointAtPolylineT(polyline, t);
  return sample === null ? null : sample.tangent;
}

export function getNearestPointOnPolyline(polyline: PolylinePath, point: Point2D): PolylineSampleResult | null {
  // O metodo encontra o ponto mais proximo iterando pelos segmentos e mantendo o melhor candidato.
  const segments = polylineToSegments(polyline);

  if (segments.length === 0) {
    return null;
  }

  let bestSample: PolylineSampleResult | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let consumed = 0;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (segment === undefined) {
      continue;
    }

    const segmentLength = distance(segment.start, segment.end);
    const projection = projectPointOnSegment(point, segment.start, segment.end);
    const candidateDistance = distance(projection.point, point);

    if (candidateDistance < bestDistance) {
      const tangent = normalize(subtractPoints(segment.end, segment.start));
      const distanceWithinSegment = distance(projection.point, segment.start);
      bestDistance = candidateDistance;
      bestSample = {
        point: projection.point,
        segmentIndex: index,
        tangent,
        distanceAlong: consumed + distanceWithinSegment
      };
    }

    consumed += segmentLength;
  }

  return bestSample;
}

export function getPolylineMidpoints(polyline: PolylinePath): ReadonlyArray<Point2D> {
  // O metodo retorna o meio de cada segmento na ordem natural, util para snap midpoint.
  return polylineToSegments(polyline).map((segment) => midpoint(segment.start, segment.end));
}

export function getPolylineVertices(polyline: PolylinePath): ReadonlyArray<Point2D> {
  // O metodo expoe somente os vertices definidos; nao adiciona o ponto de fechamento mesmo quando closed.
  return polyline.points;
}

export function transformPolylinePoints(
  points: ReadonlyArray<Point2D>,
  transform: Matrix2D
): ReadonlyArray<Point2D> {
  // O metodo aplica uma matriz afim a todos os vertices preservando a ordem original.
  return points.map((point) => transformPoint(point, transform));
}

function clampDistance(distanceAlong: number, totalLength: number, closed: boolean): number {
  if (closed) {
    return wrapDistance(distanceAlong, totalLength);
  }

  if (distanceAlong < 0) {
    return 0;
  }

  if (distanceAlong > totalLength) {
    return totalLength;
  }

  return distanceAlong;
}

function wrapDistance(distanceAlong: number, totalLength: number): number {
  // O metodo normaliza distancias negativas ou maiores que o comprimento para o intervalo valido em uma volta fechada.
  if (totalLength <= 0) {
    return 0;
  }

  const wrapped = distanceAlong % totalLength;
  return wrapped < 0 ? wrapped + totalLength : wrapped;
}

function clampT(t: number): number {
  if (!Number.isFinite(t) || t < 0) {
    return 0;
  }

  if (t > 1) {
    return 1;
  }

  return t;
}

function wrapT(t: number): number {
  if (!Number.isFinite(t)) {
    return 0;
  }

  const wrapped = t % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}
