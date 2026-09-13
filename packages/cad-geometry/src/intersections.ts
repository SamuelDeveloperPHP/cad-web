import { CAD_EPSILON } from "./constants";
import type { Point2D } from "./types";
import { arcPointAtAngle, arcSweepAngle, isAngleOnArc } from "./arc";
import {
  ellipseArcPoints,
  ellipseParamAtPoint,
  isFullEllipse,
  normalizeEllipseSweep,
  type EllipseGeometry
} from "./ellipse";

const TWO_PI = Math.PI * 2;

/**
 * Primitivas geométricas usadas pelo cálculo de interseção. Toda entidade é reduzida a uma lista
 * destas primitivas: linhas/retângulos/polylines viram segmentos; círculos e arcos viram círculo
 * com faixa angular opcional; elipses e arcos de elipse viram elipse com faixa paramétrica opcional.
 */
export type IntersectSegment = Readonly<{ kind: "segment"; a: Point2D; b: Point2D }>;

export type IntersectCircle = Readonly<{
  kind: "circle";
  center: Point2D;
  radius: number;
  arc?: Readonly<{ startAngle: number; endAngle: number; clockwise: boolean }> | undefined;
}>;

export type IntersectEllipse = Readonly<{ kind: "ellipse"; ellipse: EllipseGeometry }>;

export type IntersectPrimitive = IntersectSegment | IntersectCircle | IntersectEllipse;

/**
 * Interseção de dois segmentos (limitados). Retorna o ponto quando os parâmetros de ambos caem em [0,1].
 */
export function segmentSegmentIntersection(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
  epsilon = CAD_EPSILON
): Point2D | null {
  const r = { x: a2.x - a1.x, y: a2.y - a1.y };
  const s = { x: b2.x - b1.x, y: b2.y - b1.y };
  const denominator = r.x * s.y - r.y * s.x;

  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const delta = { x: b1.x - a1.x, y: b1.y - a1.y };
  const t = (delta.x * s.y - delta.y * s.x) / denominator;
  const u = (delta.x * r.y - delta.y * r.x) / denominator;

  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) {
    return null;
  }

  return { x: a1.x + t * r.x, y: a1.y + t * r.y };
}

/**
 * Interseções de um segmento com um círculo (limitadas ao segmento). Retorna 0, 1 ou 2 pontos.
 */
export function segmentCircleIntersections(
  a1: Point2D,
  a2: Point2D,
  center: Point2D,
  radius: number,
  epsilon = CAD_EPSILON
): ReadonlyArray<Point2D> {
  const d = { x: a2.x - a1.x, y: a2.y - a1.y };
  const f = { x: a1.x - center.x, y: a1.y - center.y };
  const a = d.x * d.x + d.y * d.y;

  if (a <= epsilon * epsilon) {
    return [];
  }

  const b = 2 * (f.x * d.x + f.y * d.y);
  const c = f.x * f.x + f.y * f.y - radius * radius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < -epsilon) {
    return [];
  }

  const root = Math.sqrt(Math.max(0, discriminant));
  const parameters = discriminant <= epsilon ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  const points: Point2D[] = [];

  for (const t of parameters) {
    if (t >= -epsilon && t <= 1 + epsilon) {
      points.push({ x: a1.x + t * d.x, y: a1.y + t * d.y });
    }
  }

  return points;
}

/**
 * Interseções de um segmento com uma elipse (limitadas ao segmento e à varredura do arco, se houver).
 * O segmento é levado ao espaço normalizado da elipse (des-rotacionado e dividido pelos semi-eixos),
 * onde a elipse vira o círculo unitário.
 */
export function segmentEllipseIntersections(
  a1: Point2D,
  a2: Point2D,
  ellipse: EllipseGeometry,
  epsilon = CAD_EPSILON
): ReadonlyArray<Point2D> {
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  const rx = Math.max(ellipse.radiusX, CAD_EPSILON);
  const ry = Math.max(ellipse.radiusY, CAD_EPSILON);

  const toLocal = (p: Point2D): Point2D => {
    const dx = p.x - ellipse.center.x;
    const dy = p.y - ellipse.center.y;
    return { x: (dx * cos + dy * sin) / rx, y: (-dx * sin + dy * cos) / ry };
  };

  const localA = toLocal(a1);
  const localB = toLocal(a2);
  // No espaço normalizado, intersecta o segmento com o círculo unitário; os parâmetros valem no segmento original.
  const d = { x: localB.x - localA.x, y: localB.y - localA.y };
  const a = d.x * d.x + d.y * d.y;

  if (a <= epsilon * epsilon) {
    return [];
  }

  const b = 2 * (localA.x * d.x + localA.y * d.y);
  const c = localA.x * localA.x + localA.y * localA.y - 1;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < -epsilon) {
    return [];
  }

  const root = Math.sqrt(Math.max(0, discriminant));
  const parameters = discriminant <= epsilon ? [-b / (2 * a)] : [(-b - root) / (2 * a), (-b + root) / (2 * a)];
  const points: Point2D[] = [];

  for (const t of parameters) {
    if (t < -epsilon || t > 1 + epsilon) {
      continue;
    }

    const point = { x: a1.x + t * (a2.x - a1.x), y: a1.y + t * (a2.y - a1.y) };

    if (isPointInEllipseSweep(point, ellipse)) {
      points.push(point);
    }
  }

  return points;
}

/**
 * Interseções de dois círculos completos. Retorna 0, 1 ou 2 pontos.
 */
export function circleCircleIntersections(
  c1: Point2D,
  r1: number,
  c2: Point2D,
  r2: number,
  epsilon = CAD_EPSILON
): ReadonlyArray<Point2D> {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);

  if (d <= epsilon || d > r1 + r2 + epsilon || d < Math.abs(r1 - r2) - epsilon) {
    return [];
  }

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const hSquared = r1 * r1 - a * a;
  const h = Math.sqrt(Math.max(0, hSquared));
  const midpoint = { x: c1.x + (a * dx) / d, y: c1.y + (a * dy) / d };

  if (h <= epsilon) {
    return [midpoint];
  }

  const offsetX = (h * dy) / d;
  const offsetY = (h * dx) / d;

  return [
    { x: midpoint.x + offsetX, y: midpoint.y - offsetY },
    { x: midpoint.x - offsetX, y: midpoint.y + offsetY }
  ];
}

// Testa se um ponto pertence à faixa angular do arco de círculo (ou true quando é círculo completo).
function isPointInCircleArc(point: Point2D, primitive: IntersectCircle, epsilon = CAD_EPSILON): boolean {
  if (primitive.arc === undefined) {
    return true;
  }

  const angle = Math.atan2(point.y - primitive.center.y, point.x - primitive.center.x);
  return isAngleOnArc(angle, primitive.arc.startAngle, primitive.arc.endAngle, primitive.arc.clockwise, epsilon);
}

// Testa se um ponto pertence à varredura do arco de elipse (ou true quando é elipse completa).
function isPointInEllipseSweep(point: Point2D, ellipse: EllipseGeometry): boolean {
  if (isFullEllipse(ellipse)) {
    return true;
  }

  const start = ellipse.startAngle ?? 0;
  const { sweep } = normalizeEllipseSweep(ellipse.startAngle ?? 0, ellipse.endAngle ?? TWO_PI);
  const param = ellipseParamAtPoint(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, point);
  const relative = (param - start + TWO_PI * 2) % TWO_PI;

  return relative <= sweep + 1e-9;
}

// Amostra um círculo/arco em uma polyline (segmentos), respeitando a faixa angular.
function sampleCircle(primitive: IntersectCircle, samples: number): Point2D[] {
  const start = primitive.arc?.startAngle ?? 0;
  const sweep = primitive.arc === undefined
    ? TWO_PI
    : (primitive.arc.clockwise
        ? arcSweepAngle(primitive.arc.startAngle, primitive.arc.endAngle, true)
        : -arcSweepAngle(primitive.arc.startAngle, primitive.arc.endAngle, false));
  const points: Point2D[] = [];

  for (let index = 0; index <= samples; index += 1) {
    const angle = start + (sweep * index) / samples;
    points.push(arcPointAtAngle(primitive.center, primitive.radius, angle));
  }

  return points;
}

/**
 * Pontos de interseção entre duas primitivas. Pares com um segmento usam solução analítica; pares
 * curva×curva (círculo/elipse × círculo/elipse) amostram uma das curvas em segmentos e resolvem
 * analiticamente contra a outra, filtrando pelos limites de ambas.
 */
export function intersectPrimitives(
  p: IntersectPrimitive,
  q: IntersectPrimitive,
  samples = 96,
  epsilon = CAD_EPSILON
): ReadonlyArray<Point2D> {
  if (p.kind === "segment" && q.kind === "segment") {
    const point = segmentSegmentIntersection(p.a, p.b, q.a, q.b, epsilon);
    return point === null ? [] : [point];
  }

  if (p.kind === "segment" && q.kind === "circle") {
    return segmentCircleIntersections(p.a, p.b, q.center, q.radius, epsilon).filter((point) => isPointInCircleArc(point, q, epsilon));
  }

  if (p.kind === "circle" && q.kind === "segment") {
    return intersectPrimitives(q, p, samples, epsilon);
  }

  if (p.kind === "segment" && q.kind === "ellipse") {
    return segmentEllipseIntersections(p.a, p.b, q.ellipse, epsilon);
  }

  if (p.kind === "ellipse" && q.kind === "segment") {
    return intersectPrimitives(q, p, samples, epsilon);
  }

  if (p.kind === "circle" && q.kind === "circle") {
    return circleCircleIntersections(p.center, p.radius, q.center, q.radius, epsilon)
      .filter((point) => isPointInCircleArc(point, p, epsilon) && isPointInCircleArc(point, q, epsilon));
  }

  if (p.kind === "circle" && q.kind === "ellipse") {
    return sampleCurveAgainstEllipse(sampleCircle(p, samples), q.ellipse, (point) => isPointInCircleArc(point, p, epsilon), epsilon);
  }

  if (p.kind === "ellipse" && q.kind === "circle") {
    return sampleCurveAgainstEllipse(sampleCircle(q, samples), p.ellipse, (point) => isPointInCircleArc(point, q, epsilon), epsilon);
  }

  if (p.kind === "ellipse" && q.kind === "ellipse") {
    // ellipse × ellipse: amostra a primeira e resolve contra a segunda.
    const sampled = ellipseArcPoints(p.ellipse, samples);
    return sampleCurveAgainstEllipse(sampled, q.ellipse, () => true, epsilon).filter((point) => isPointInEllipseSweep(point, p.ellipse));
  }

  return [];
}

// Intersecta cada segmento de uma polyline amostrada contra uma elipse, aplicando um filtro extra.
function sampleCurveAgainstEllipse(
  sampledPoints: ReadonlyArray<Point2D>,
  ellipse: EllipseGeometry,
  extraFilter: (point: Point2D) => boolean,
  epsilon: number
): Point2D[] {
  const results: Point2D[] = [];

  for (let index = 0; index < sampledPoints.length - 1; index += 1) {
    const start = sampledPoints[index];
    const end = sampledPoints[index + 1];

    if (start === undefined || end === undefined) {
      continue;
    }

    for (const point of segmentEllipseIntersections(start, end, ellipse, epsilon)) {
      if (extraFilter(point)) {
        results.push(point);
      }
    }
  }

  return results;
}
