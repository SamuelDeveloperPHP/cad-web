import { nearestPointOnEllipse } from "./ellipse";
import { curveParamAt, wrapAngle, type CurveSpan, type PeriodicCurve } from "./curveTrim";
import { isInsideCurve } from "./filletCurve";
import {
  bezierChainDerivative,
  bezierChainLength,
  bezierSegmentCount,
  evaluateBezierChain,
  isValidBezierChain,
  nearestOnBezierChain,
  subBezierChain,
  type BezierChain
} from "./spline";
import type { Point2D, Vector2D } from "./types";

/**
 * Fillet com spline: spline × linha, spline × curva (círculo, arco, elipse, arco de elipse) e spline × spline.
 *
 * O centro do arco de concordância fica na paralela da spline à distância r, do lado em que o outro objeto
 * foi escolhido: C(u) = S(u) + lado·r·N(u). Ele também precisa estar à distância r do outro objeto, do lado
 * em que a spline foi escolhida: g(u) = lado'·distância_com_sinal(C(u), outro) − r = 0. A equação é resolvida
 * por varredura + bisseção ao longo da spline; raízes falsas (saltos da projeção no outro objeto) são
 * descartadas pela verificação do resíduo, e vale a solução mais próxima dos pontos clicados (AutoCAD).
 *
 * Aparas: a linha vai até a tangência mantendo o lado do clique; arcos, arcos de elipse e splines abertas
 * são aparados na tangência; círculos, elipses e splines fechadas ficam inteiros (como no AutoCAD).
 */

export type FilletOperand =
  | Readonly<{ kind: "line"; start: Point2D; end: Point2D }>
  | Readonly<{ kind: "curve"; curve: PeriodicCurve; span: CurveSpan | null }>
  | Readonly<{ kind: "spline"; chain: BezierChain; closed: boolean }>;

export type FilletOperandResult =
  | Readonly<{ kind: "line"; start: Point2D; end: Point2D }>
  // Nova faixa da curva; null quando a curva é fechada e fica inteira.
  | Readonly<{ kind: "curve"; span: CurveSpan | null }>
  // Nova cadeia da spline; null quando a spline é fechada e fica inteira.
  | Readonly<{ kind: "spline"; chain: BezierChain | null }>;

export type SplineFilletInput = Readonly<{
  spline: Readonly<{ chain: BezierChain; closed: boolean }>;
  splinePick: Point2D;
  other: FilletOperand;
  otherPick: Point2D;
  radius: number;
}>;

export type SplineFilletResult =
  | Readonly<{
      ok: true;
      arc: Readonly<{ center: Point2D; radius: number; startAngle: number; endAngle: number; clockwise: boolean }>;
      spline: BezierChain | null;
      other: FilletOperandResult;
      tangentOnSpline: Point2D;
      tangentOnOther: Point2D;
    }>
  | Readonly<{ ok: false; reason: string }>;

type Projection = Readonly<{ signed: number; point: Point2D; param: number; valid: boolean }>;

const SAMPLES_PER_SEGMENT = 96;
const RADIUS_INVALID = "Radius too large or invalid";

export function computeSplineFillet(input: SplineFilletInput): SplineFilletResult {
  const { spline, other, radius } = input;

  if (!(radius > 0) || !isValidBezierChain(spline.chain)) return { ok: false, reason: RADIUS_INVALID };
  if (other.kind === "line" && Math.hypot(other.end.x - other.start.x, other.end.y - other.start.y) <= 0) {
    return { ok: false, reason: RADIUS_INVALID };
  }

  const splineOperand: FilletOperand = { kind: "spline", chain: spline.chain, closed: spline.closed };
  // O centro fica do lado da spline onde o outro objeto foi escolhido, e do lado do outro onde a spline foi escolhida.
  const splineSide = sign(project(splineOperand, input.otherPick).signed);
  const otherSide = sign(project(other, input.splinePick).signed);
  const centerAt = (u: number): Point2D | null => {
    const normal = unitLeftNormal(spline.chain, u);
    if (normal === null) return null;
    const point = evaluateBezierChain(spline.chain, u);
    return { x: point.x + splineSide * radius * normal.x, y: point.y + splineSide * radius * normal.y };
  };
  const g = (u: number): number => {
    const center = centerAt(u);
    return center === null ? Number.NaN : otherSide * project(other, center).signed - radius;
  };

  const n = bezierSegmentCount(spline.chain);
  const steps = n * SAMPLES_PER_SEGMENT;
  const scale = Math.max(radius, bezierChainLength(spline.chain));
  const tolerance = 1e-6 * scale;
  const roots: number[] = [];
  let previousU = 0;
  let previousValue = g(0);

  for (let step = 1; step <= steps; step += 1) {
    const u = (n * step) / steps;
    const value = g(u);

    if (Number.isFinite(previousValue) && Number.isFinite(value)) {
      if (previousValue === 0) roots.push(previousU);
      else if (previousValue * value < 0) roots.push(bisect(g, previousU, u, previousValue));
    }

    previousU = u;
    previousValue = value;
  }

  if (Number.isFinite(previousValue) && previousValue === 0) roots.push(previousU);

  let best: Readonly<{ u: number; center: Point2D; tangentOnSpline: Point2D; projection: Projection; score: number }> | null = null;

  for (const u of roots) {
    const center = centerAt(u);
    if (center === null) continue;

    const projection = project(other, center);
    // Descarta saltos da projeção (não são tangências) e pontos fora da faixa do outro objeto.
    if (!projection.valid || Math.abs(otherSide * projection.signed - radius) > tolerance) continue;

    const tangentOnSpline = evaluateBezierChain(spline.chain, u);
    const score = distanceOf(tangentOnSpline, input.splinePick) + distanceOf(projection.point, input.otherPick);

    if (best === null || score < best.score) best = { u, center, tangentOnSpline, projection, score };
  }

  if (best === null) return { ok: false, reason: RADIUS_INVALID };

  const splineResult = trimSplineAt(spline.chain, spline.closed, best.u, input.splinePick);
  const otherResult = trimOperandAt(other, best.projection, best.center, input.otherPick);

  if (splineResult === undefined || otherResult === undefined) return { ok: false, reason: RADIUS_INVALID };

  const tangentOnOther = best.projection.point;
  // Arco menor entre as tangências (sempre < 180°); clockwise = true cresce o ângulo do mundo.
  const startAngle = Math.atan2(best.tangentOnSpline.y - best.center.y, best.tangentOnSpline.x - best.center.x);
  const endAngle = Math.atan2(tangentOnOther.y - best.center.y, tangentOnOther.x - best.center.x);
  const clockwise = wrapAngle(endAngle - startAngle) <= Math.PI;

  return {
    ok: true,
    arc: { center: best.center, radius, startAngle, endAngle, clockwise },
    spline: splineResult,
    other: otherResult,
    tangentOnSpline: best.tangentOnSpline,
    tangentOnOther
  };
}

/**
 * Projeção de um ponto no objeto: ponto mais próximo, parâmetro e distância com sinal
 * (linha e spline: positivo à esquerda do sentido; círculo e elipse: positivo fora).
 * valid = a projeção cai dentro do objeto (faixa do arco, interior da spline aberta).
 */
function project(operand: FilletOperand, point: Point2D): Projection {
  if (operand.kind === "line") {
    const dx = operand.end.x - operand.start.x;
    const dy = operand.end.y - operand.start.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const along = (point.x - operand.start.x) * ux + (point.y - operand.start.y) * uy;
    return {
      signed: ux * (point.y - operand.start.y) - uy * (point.x - operand.start.x),
      point: { x: operand.start.x + ux * along, y: operand.start.y + uy * along },
      param: along,
      valid: true
    };
  }

  if (operand.kind === "curve") {
    const { curve, span } = operand;
    let nearest: Point2D;
    let signed: number;

    if (curve.kind === "circle") {
      const dx = point.x - curve.center.x;
      const dy = point.y - curve.center.y;
      const d = Math.hypot(dx, dy) || 1e-300;
      nearest = { x: curve.center.x + (curve.radius * dx) / d, y: curve.center.y + (curve.radius * dy) / d };
      signed = d - curve.radius;
    } else {
      nearest = nearestPointOnEllipse(point, { type: "ellipse", center: curve.center, radiusX: curve.radiusX, radiusY: curve.radiusY, rotation: curve.rotation }, 180);
      const d = distanceOf(point, nearest);
      signed = isInsideCurve(curve, point) ? -d : d;
    }

    const param = curveParamAt(curve, nearest);
    const valid = span === null || wrapAngle(param - span.start) <= span.sweep + 1e-9;
    return { signed, point: nearest, param, valid };
  }

  const hit = nearestOnBezierChain(operand.chain, point);
  const tangent = safeTangent(operand.chain, hit.u);
  const cross = tangent.x * (point.y - hit.point.y) - tangent.y * (point.x - hit.point.x);
  const n = bezierSegmentCount(operand.chain);
  // Na spline aberta, a projeção na ponta não é perpendicular: não serve de tangência.
  const valid = operand.closed || (hit.u > 1e-7 && hit.u < n - 1e-7);
  return { signed: cross >= 0 ? hit.distance : -hit.distance, point: hit.point, param: hit.u, valid };
}

// Parte da spline que fica após o fillet: o lado do clique; undefined quando degenerada.
function trimSplineAt(chain: BezierChain, closed: boolean, u: number, pick: Point2D): BezierChain | null | undefined {
  if (closed) return null;

  const n = bezierSegmentCount(chain);
  const pickU = nearestOnBezierChain(chain, pick).u;
  const kept = pickU <= u ? subBezierChain(chain, 0, u) : subBezierChain(chain, u, n);

  if (!isValidBezierChain(kept) || bezierChainLength(kept) <= 1e-9 * Math.max(1, bezierChainLength(chain))) return undefined;
  return kept;
}

function trimOperandAt(operand: FilletOperand, projection: Projection, center: Point2D, pick: Point2D): FilletOperandResult | undefined {
  if (operand.kind === "spline") {
    const chain = trimSplineAt(operand.chain, operand.closed, projection.param, pick);
    return chain === undefined ? undefined : { kind: "spline", chain };
  }

  if (operand.kind === "curve") {
    if (operand.span === null) return { kind: "curve", span: null };

    const span = operand.span;
    const tangentOffset = wrapAngle(projection.param - span.start);
    const pickOffset = wrapAngle(curveParamAt(operand.curve, pick) - span.start);
    // Mantém o lado da faixa onde a curva foi clicada.
    const kept = pickOffset <= tangentOffset
      ? { start: span.start, sweep: tangentOffset }
      : { start: span.start + tangentOffset, sweep: span.sweep - tangentOffset };

    return kept.sweep <= 1e-9 ? undefined : { kind: "curve", span: kept };
  }

  // A linha vai até a tangência (aparada ou estendida), mantendo a ponta do lado do clique.
  const dx = operand.end.x - operand.start.x;
  const dy = operand.end.y - operand.start.y;
  const length = Math.hypot(dx, dy);
  const along = (point: Point2D) => ((point.x - operand.start.x) * dx + (point.y - operand.start.y) * dy) / length;
  const tangentAlong = along(center);
  const result = along(pick) <= tangentAlong
    ? { start: operand.start, end: projection.point }
    : { start: projection.point, end: operand.end };

  return distanceOf(result.start, result.end) <= 1e-9 ? undefined : { kind: "line", ...result };
}

function unitLeftNormal(chain: BezierChain, u: number): Vector2D | null {
  const tangent = safeTangent(chain, u);
  const length = Math.hypot(tangent.x, tangent.y);
  return length > 1e-12 ? { x: -tangent.y / length, y: tangent.x / length } : null;
}

// Derivada que não se anula em pontas com alça de comprimento zero (usa um parâmetro vizinho).
function safeTangent(chain: BezierChain, u: number): Vector2D {
  const derivative = bezierChainDerivative(chain, u);
  if (Math.hypot(derivative.x, derivative.y) > 1e-12) return derivative;
  const n = bezierSegmentCount(chain);
  return bezierChainDerivative(chain, u >= n ? u - 1e-6 : u + 1e-6);
}

function bisect(f: (u: number) => number, low: number, high: number, lowValue: number): number {
  let a = low;
  let b = high;
  let fa = lowValue;

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (a + b) / 2;
    const value = f(middle);
    if (value === 0 || !Number.isFinite(value)) return middle;
    if (fa * value < 0) b = middle;
    else {
      a = middle;
      fa = value;
    }
  }

  return (a + b) / 2;
}

function sign(value: number): 1 | -1 {
  return value >= 0 ? 1 : -1;
}

function distanceOf(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
