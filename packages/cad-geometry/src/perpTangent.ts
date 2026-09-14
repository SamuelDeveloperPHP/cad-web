import { CAD_EPSILON } from "./constants";
import type { Point2D } from "./types";
import { isAngleOnArc } from "./arc";
import {
  ellipsePointAtParam,
  isFullEllipse,
  normalizeEllipseSweep,
  type EllipseGeometry
} from "./ellipse";
import type { IntersectCircle, IntersectEllipse, IntersectPrimitive, IntersectSegment } from "./intersections";

const TWO_PI = Math.PI * 2;

// Filtra um ponto pela faixa angular do arco de círculo (ou true quando círculo completo).
function pointInCircleArc(point: Point2D, primitive: IntersectCircle, epsilon = CAD_EPSILON): boolean {
  if (primitive.arc === undefined) {
    return true;
  }

  const angle = Math.atan2(point.y - primitive.center.y, point.x - primitive.center.x);
  return isAngleOnArc(angle, primitive.arc.startAngle, primitive.arc.endAngle, primitive.arc.clockwise, epsilon);
}

// Faixa paramétrica varrida pela elipse (0..2π quando completa).
function ellipseRange(ellipse: EllipseGeometry): { start: number; sweep: number } {
  if (isFullEllipse(ellipse)) {
    return { start: ellipse.startAngle ?? 0, sweep: TWO_PI };
  }

  const { sweep } = normalizeEllipseSweep(ellipse.startAngle ?? 0, ellipse.endAngle ?? TWO_PI);
  return { start: ellipse.startAngle ?? 0, sweep };
}

// Tangente (não normalizada) à elipse no ângulo paramétrico t, já rotacionada para o mundo.
function ellipseTangentAt(ellipse: EllipseGeometry, t: number): Point2D {
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  const dx = -ellipse.radiusX * Math.sin(t);
  const dy = ellipse.radiusY * Math.cos(t);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/**
 * Encontra raízes de g(t) na faixa [start, start+sweep] por varredura com mudança de sinal e bisseção.
 * Usado para perpendicular e tangente em elipses, que não têm forma fechada simples.
 */
function findRootsOnEllipse(
  ellipse: EllipseGeometry,
  g: (t: number) => number,
  samples = 180
): ReadonlyArray<number> {
  const { start, sweep } = ellipseRange(ellipse);
  const steps = Math.max(24, Math.floor(samples));
  const stepSize = sweep / steps;
  const roots: number[] = [];

  let previousT = start;
  let previousValue = g(start);

  for (let index = 1; index <= steps; index += 1) {
    const currentT = start + index * stepSize;
    const currentValue = g(currentT);

    if (previousValue === 0) {
      roots.push(previousT);
    } else if (previousValue * currentValue < 0) {
      // Bisseção no intervalo com troca de sinal.
      let low = previousT;
      let high = currentT;
      let lowValue = previousValue;

      for (let iteration = 0; iteration < 40; iteration += 1) {
        const mid = (low + high) / 2;
        const midValue = g(mid);

        if (midValue === 0 || (high - low) < 1e-10) {
          low = mid;
          break;
        }

        if (lowValue * midValue < 0) {
          high = mid;
        } else {
          low = mid;
          lowValue = midValue;
        }
      }

      roots.push((low + high) / 2);
    }

    previousT = currentT;
    previousValue = currentValue;
  }

  return roots;
}

/**
 * Pontos da primitiva cujo raio até `from` é perpendicular à curva naquele ponto (pé da perpendicular).
 */
export function perpendicularPointsOnPrimitive(
  primitive: IntersectPrimitive,
  from: Point2D,
  epsilon = CAD_EPSILON
): ReadonlyArray<Point2D> {
  if (primitive.kind === "segment") {
    return perpendicularOnSegment(primitive, from, epsilon);
  }

  if (primitive.kind === "circle") {
    return perpendicularOnCircle(primitive, from, epsilon);
  }

  return perpendicularOnEllipse(primitive, from);
}

/**
 * Pontos da primitiva onde a reta que passa por `from` é tangente à curva.
 * Segmentos não têm ponto de tangência (retornam vazio).
 */
export function tangentPointsOnPrimitive(
  primitive: IntersectPrimitive,
  from: Point2D,
  epsilon = CAD_EPSILON
): ReadonlyArray<Point2D> {
  if (primitive.kind === "circle") {
    return tangentOnCircle(primitive, from, epsilon);
  }

  if (primitive.kind === "ellipse") {
    return tangentOnEllipse(primitive, from);
  }

  return [];
}

function perpendicularOnSegment(segment: IntersectSegment, from: Point2D, epsilon: number): ReadonlyArray<Point2D> {
  const dx = segment.b.x - segment.a.x;
  const dy = segment.b.y - segment.a.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared <= epsilon * epsilon) {
    return [];
  }

  // Parâmetro bruto da projeção (sem clamp), para saber se o pé cai dentro do segmento.
  const t = ((from.x - segment.a.x) * dx + (from.y - segment.a.y) * dy) / lengthSquared;

  if (t < -epsilon || t > 1 + epsilon) {
    return [];
  }

  return [{ x: segment.a.x + t * dx, y: segment.a.y + t * dy }];
}

function perpendicularOnCircle(circle: IntersectCircle, from: Point2D, epsilon: number): ReadonlyArray<Point2D> {
  const dx = from.x - circle.center.x;
  const dy = from.y - circle.center.y;
  const length = Math.hypot(dx, dy);

  if (length <= epsilon) {
    return [];
  }

  // A perpendicular a um círculo passa pelo centro; os pés são os dois pontos colineares com centro e `from`.
  const ux = dx / length;
  const uy = dy / length;
  const points = [
    { x: circle.center.x + ux * circle.radius, y: circle.center.y + uy * circle.radius },
    { x: circle.center.x - ux * circle.radius, y: circle.center.y - uy * circle.radius }
  ];

  return points.filter((point) => pointInCircleArc(point, circle, epsilon));
}

function perpendicularOnEllipse(primitive: IntersectEllipse, from: Point2D): ReadonlyArray<Point2D> {
  const ellipse = primitive.ellipse;
  // Pé da perpendicular: (from - P(t)) perpendicular à tangente => dot((from-P), tangent) = 0.
  const g = (t: number): number => {
    const point = ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, t);
    const tangent = ellipseTangentAt(ellipse, t);
    return (from.x - point.x) * tangent.x + (from.y - point.y) * tangent.y;
  };

  return findRootsOnEllipse(ellipse, g).map((t) =>
    ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, t)
  );
}

function tangentOnCircle(circle: IntersectCircle, from: Point2D, epsilon: number): ReadonlyArray<Point2D> {
  const dx = from.x - circle.center.x;
  const dy = from.y - circle.center.y;
  const d = Math.hypot(dx, dy);

  // Sem tangente quando `from` está dentro do círculo.
  if (d < circle.radius - epsilon) {
    return [];
  }

  const baseAngle = Math.atan2(dy, dx);

  if (Math.abs(d - circle.radius) <= epsilon) {
    // `from` na borda: o próprio ponto é o de tangência.
    const point = { x: circle.center.x + Math.cos(baseAngle) * circle.radius, y: circle.center.y + Math.sin(baseAngle) * circle.radius };
    return pointInCircleArc(point, circle, epsilon) ? [point] : [];
  }

  const offset = Math.acos(Math.min(1, circle.radius / d));
  const points = [baseAngle + offset, baseAngle - offset].map((angle) => ({
    x: circle.center.x + Math.cos(angle) * circle.radius,
    y: circle.center.y + Math.sin(angle) * circle.radius
  }));

  return points.filter((point) => pointInCircleArc(point, circle, epsilon));
}

function tangentOnEllipse(primitive: IntersectEllipse, from: Point2D): ReadonlyArray<Point2D> {
  const ellipse = primitive.ellipse;
  // Tangência: (from - P(t)) paralelo à tangente => cross((from-P), tangent) = 0.
  const g = (t: number): number => {
    const point = ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, t);
    const tangent = ellipseTangentAt(ellipse, t);
    return (from.x - point.x) * tangent.y - (from.y - point.y) * tangent.x;
  };

  return findRootsOnEllipse(ellipse, g).map((t) =>
    ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, t)
  );
}
