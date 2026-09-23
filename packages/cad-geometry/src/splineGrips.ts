import { fitPointsToBezierChain, isValidBezierChain } from "./spline";
import type { Point2D } from "./types";

/**
 * Grips (alças de edição) da spline, como no AutoCAD:
 * - spline por pontos de ajuste: um grip por ponto de ajuste; arrastar recalcula a curva (C2) por eles;
 * - spline só com pontos de controle (importada, aparada, offset): um grip por vértice de controle da cadeia
 *   de Béziers. Arrastar um vértice da curva leva junto as duas alças dele (a forma em volta se mantém);
 *   arrastar uma alça mantém a junção suave: se a alça oposta estava alinhada, ela gira junto (mesmo comprimento).
 */

export type SplineGripKind = "fit" | "control";

export type SplineGrip = Readonly<{
  id: string;
  kind: SplineGripKind;
  index: number;
  point: Point2D;
}>;

export type SplineGripShape = Readonly<{
  controlPoints: ReadonlyArray<Point2D>;
  closed: boolean;
  fitPoints?: ReadonlyArray<Point2D> | undefined;
}>;

export type SplineGripUpdate = Readonly<{
  controlPoints: ReadonlyArray<Point2D>;
  fitPoints?: ReadonlyArray<Point2D>;
}>;

const SMOOTH_ANGLE_TOLERANCE = 1e-3;

export function splineUsesFitGrips(spline: SplineGripShape): boolean {
  return spline.fitPoints !== undefined && spline.fitPoints.length >= 2;
}

export function getSplineGripPoints(spline: SplineGripShape): ReadonlyArray<SplineGrip> {
  if (splineUsesFitGrips(spline)) {
    return spline.fitPoints!.map((point, index) => ({ id: `fit:${index}`, kind: "fit" as const, index, point }));
  }

  const count = controlGripCount(spline);
  return spline.controlPoints.slice(0, count).map((point, index) => ({ id: `cv:${index}`, kind: "control" as const, index, point }));
}

/**
 * Nova geometria da spline com o grip levado a point; null quando o grip não existe.
 */
export function updateSplineByGrip(spline: SplineGripShape, gripId: string, point: Point2D): SplineGripUpdate | null {
  const match = /^(fit|cv):(\d+)$/.exec(gripId);
  if (match === null) return null;

  const index = Number(match[2]);

  if (match[1] === "fit") {
    if (!splineUsesFitGrips(spline) || index >= spline.fitPoints!.length) return null;
    const fitPoints = spline.fitPoints!.map((fit, i) => (i === index ? { x: point.x, y: point.y } : fit));
    return { fitPoints, controlPoints: fitPointsToBezierChain(fitPoints, spline.closed) };
  }

  if (splineUsesFitGrips(spline) || !isValidBezierChain(spline.controlPoints) || index >= controlGripCount(spline)) return null;
  return { controlPoints: moveControlVertex(spline, index, point) };
}

/**
 * Linhas da armação de controle (vértice da curva → alça), desenhadas junto dos grips de vértices de controle.
 */
export function splineControlFrame(spline: SplineGripShape): ReadonlyArray<readonly [Point2D, Point2D]> {
  if (splineUsesFitGrips(spline) || !isValidBezierChain(spline.controlPoints)) return [];

  const points = spline.controlPoints;
  const lines: Array<readonly [Point2D, Point2D]> = [];

  for (let base = 0; base + 3 < points.length; base += 3) {
    lines.push([points[base]!, points[base + 1]!], [points[base + 2]!, points[base + 3]!]);
  }

  return lines;
}

// Na cadeia fechada o último ponto repete o primeiro: um só grip para os dois.
function controlGripCount(spline: SplineGripShape): number {
  const points = spline.controlPoints;
  return isPeriodicChain(spline) ? points.length - 1 : points.length;
}

function isPeriodicChain(spline: SplineGripShape): boolean {
  const points = spline.controlPoints;
  const first = points[0];
  const last = points[points.length - 1];
  return spline.closed && first !== undefined && last !== undefined && points.length > 4
    && Math.hypot(first.x - last.x, first.y - last.y) <= 1e-9 * Math.max(1, Math.abs(first.x), Math.abs(first.y));
}

function moveControlVertex(spline: SplineGripShape, index: number, point: Point2D): ReadonlyArray<Point2D> {
  const points = spline.controlPoints.map((p) => ({ x: p.x, y: p.y }));
  const last = points.length - 1;
  const periodic = isPeriodicChain(spline);
  // Índices que representam o mesmo ponto (a costura da cadeia fechada) e vizinhos com salto na costura.
  const twin = (i: number): number | null => (periodic && (i === 0 || i === last) ? (i === 0 ? last : 0) : null);
  const at = (i: number): number | null => {
    if (i >= 0 && i <= last) return i;
    if (!periodic) return null;
    return i < 0 ? i + last : i - last;
  };
  const set = (i: number, value: Point2D) => {
    points[i] = { x: value.x, y: value.y };
    const other = twin(i);
    if (other !== null) points[other] = { x: value.x, y: value.y };
  };

  if (index % 3 === 0) {
    // Vértice da curva: as alças acompanham o deslocamento.
    const original = spline.controlPoints[index]!;
    const dx = point.x - original.x;
    const dy = point.y - original.y;
    set(index, point);

    for (const neighbor of [at(index - 1), at(index + 1)]) {
      if (neighbor === null) continue;
      const handle = spline.controlPoints[neighbor]!;
      set(neighbor, { x: handle.x + dx, y: handle.y + dy });
    }

    return points;
  }

  // Alça: a junção é o vértice da curva ao lado dela e a alça oposta fica do outro lado da junção.
  const anchor = index % 3 === 1 ? index - 1 : index + 1;
  const opposite = at(index % 3 === 1 ? index - 2 : index + 2);
  const anchorPoint = spline.controlPoints[anchor]!;
  const before = spline.controlPoints[index]!;
  set(index, point);

  if (opposite !== null) {
    const oppositePoint = spline.controlPoints[opposite]!;
    const handleLength = Math.hypot(before.x - anchorPoint.x, before.y - anchorPoint.y);
    const oppositeLength = Math.hypot(oppositePoint.x - anchorPoint.x, oppositePoint.y - anchorPoint.y);
    const newLength = Math.hypot(point.x - anchorPoint.x, point.y - anchorPoint.y);

    if (handleLength > 0 && oppositeLength > 0 && newLength > 0) {
      const cos = ((before.x - anchorPoint.x) * (oppositePoint.x - anchorPoint.x) + (before.y - anchorPoint.y) * (oppositePoint.y - anchorPoint.y))
        / (handleLength * oppositeLength);
      // Junção suave (alças opostas e alinhadas): a alça oposta gira junto, mantendo o comprimento.
      if (cos <= -Math.cos(SMOOTH_ANGLE_TOLERANCE)) {
        set(opposite, {
          x: anchorPoint.x - ((point.x - anchorPoint.x) / newLength) * oppositeLength,
          y: anchorPoint.y - ((point.y - anchorPoint.y) / newLength) * oppositeLength
        });
      }
    }
  }

  return points;
}
