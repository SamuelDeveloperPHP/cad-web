import { CAD_EPSILON } from "./constants";
import { rotationMatrix, transformPoint } from "./matrix";
import type { Point2D, SegmentGeometry } from "./types";
import { distance } from "./vector";

// O modulo expoe utilidades puras para a operacao Explode: conversoes de entidades compostas em
// segmentos retos. O kernel nao conhece o tipo CadEntity de cad-core; trabalha com formas estruturais
// minimas para que os adapters sejam testaveis isoladamente.

export type ExplodeRectangleInput = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}>;

export type ExplodePolylineInput = Readonly<{
  points: ReadonlyArray<Point2D>;
  closed: boolean;
}>;

export function getRectangleCorners(rectangle: ExplodeRectangleInput): ReadonlyArray<Point2D> {
  // O metodo retorna os 4 cantos na ordem horaria visual: superior-esquerda, superior-direita, inferior-direita, inferior-esquerda.
  const baseCorners: ReadonlyArray<Point2D> = [
    { x: rectangle.x, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y },
    { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height },
    { x: rectangle.x, y: rectangle.y + rectangle.height }
  ];

  const rotation = rectangle.rotation ?? 0;

  if (Math.abs(rotation) <= CAD_EPSILON) {
    return baseCorners;
  }

  // O retangulo gira em torno do canto base (x, y) usando a mesma matrix afim do renderer.
  const matrix = rotationMatrix(rotation, { x: rectangle.x, y: rectangle.y });
  return baseCorners.map((corner) => transformPoint(corner, matrix));
}

export function explodeRectangleToLines(
  rectangle: ExplodeRectangleInput
): ReadonlyArray<SegmentGeometry> {
  // O metodo gera 4 segmentos formando o contorno fechado do retangulo, respeitando rotation.
  const corners = getRectangleCorners(rectangle);

  return [
    { type: "segment", start: corners[0]!, end: corners[1]! },
    { type: "segment", start: corners[1]!, end: corners[2]! },
    { type: "segment", start: corners[2]!, end: corners[3]! },
    { type: "segment", start: corners[3]!, end: corners[0]! }
  ];
}

export function isZeroLengthSegment(start: Point2D, end: Point2D, tolerance = CAD_EPSILON): boolean {
  // O calculo identifica segmentos degenerados que devem ser ignorados na explosao.
  return distance(start, end) <= tolerance;
}

export function pointsToSegments(
  points: ReadonlyArray<Point2D>,
  closed: boolean,
  tolerance = CAD_EPSILON
): ReadonlyArray<SegmentGeometry> {
  // O metodo converte uma sequencia de pontos em segmentos descartando os de comprimento zero.
  if (points.length < 2) {
    return [];
  }

  const segments: SegmentGeometry[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];

    if (start === undefined || end === undefined) {
      continue;
    }

    if (isZeroLengthSegment(start, end, tolerance)) {
      continue;
    }

    segments.push({ type: "segment", start, end });
  }

  if (closed && points.length >= 3) {
    const last = points[points.length - 1];
    const first = points[0];

    if (last !== undefined && first !== undefined && !isZeroLengthSegment(last, first, tolerance)) {
      segments.push({ type: "segment", start: last, end: first });
    }
  }

  return segments;
}

export function explodePolylineToLines(
  polyline: ExplodePolylineInput,
  tolerance = CAD_EPSILON
): ReadonlyArray<SegmentGeometry> {
  // O metodo expande uma polyline em segmentos basicos, fechando o contorno quando closed=true.
  return pointsToSegments(polyline.points, polyline.closed, tolerance);
}
