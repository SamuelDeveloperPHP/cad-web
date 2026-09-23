import { curveParamAt, curvePointAt, wrapAngle, type CurveSpan, type PeriodicCurve } from "./curveTrim";
import type { Point2D } from "./types";

/**
 * Fillet entre uma linha e uma curva (círculo, arco, elipse ou arco de elipse).
 *
 * O centro do arco de concordância está à distância r da linha (do lado da curva escolhida) e à distância r
 * da curva (do lado em que a linha foi escolhida); ou seja, fica na curva paralela Q(t) = P(t) ± r·N(t).
 * A equação lado·dist(Q(t), linha) − r = 0 é resolvida numericamente (varredura + bisseção); entre as
 * soluções, vale a mais próxima dos pontos clicados, como no AutoCAD.
 * A linha é aparada/estendida até o ponto de tangência mantendo a ponta do lado clicado; arcos e arcos de
 * elipse são aparados no ponto de tangência; círculos e elipses fechadas não são aparados (como no AutoCAD).
 */

export type LineCurveFilletInput = Readonly<{
  line: Readonly<{ start: Point2D; end: Point2D }>;
  curve: PeriodicCurve;
  span: CurveSpan | null;
  radius: number;
  linePick: Point2D;
  curvePick: Point2D;
}>;

export type LineCurveFilletResult =
  | Readonly<{
      ok: true;
      arc: Readonly<{ center: Point2D; radius: number; startAngle: number; endAngle: number; clockwise: boolean }>;
      line: Readonly<{ start: Point2D; end: Point2D }>;
      // Nova faixa da curva aberta; null quando a curva é fechada e fica inteira.
      curveSpan: CurveSpan | null;
      tangentOnLine: Point2D;
      tangentOnCurve: Point2D;
    }>
  | Readonly<{ ok: false; reason: string }>;

const SCAN_STEPS = 1440;
const TWO_PI = Math.PI * 2;

// Normal unitária externa da curva no parâmetro t.
export function curveNormalAt(curve: PeriodicCurve, t: number): Point2D {
  if (curve.kind === "circle") {
    return { x: Math.cos(t), y: Math.sin(t) };
  }

  const nx = curve.radiusY * Math.cos(t);
  const ny = curve.radiusX * Math.sin(t);
  const length = Math.hypot(nx, ny) || 1;
  const cos = Math.cos(curve.rotation);
  const sin = Math.sin(curve.rotation);

  return { x: (nx * cos - ny * sin) / length, y: (nx * sin + ny * cos) / length };
}

// Indica se o ponto está dentro da curva fechada completa.
export function isInsideCurve(curve: PeriodicCurve, point: Point2D): boolean {
  const dx = point.x - curve.center.x;
  const dy = point.y - curve.center.y;

  if (curve.kind === "circle") {
    return dx * dx + dy * dy < curve.radius * curve.radius;
  }

  const cos = Math.cos(curve.rotation);
  const sin = Math.sin(curve.rotation);
  const localX = (dx * cos + dy * sin) / curve.radiusX;
  const localY = (-dx * sin + dy * cos) / curve.radiusY;
  return localX * localX + localY * localY < 1;
}

export function computeLineCurveFillet(input: LineCurveFilletInput): LineCurveFilletResult {
  const { line, curve, radius } = input;
  const direction = { x: line.end.x - line.start.x, y: line.end.y - line.start.y };
  const length = Math.hypot(direction.x, direction.y);

  if (!(radius > 0) || length <= 0) {
    return { ok: false, reason: "Radius too large or invalid" };
  }

  const u = { x: direction.x / length, y: direction.y / length };
  const sideOf = (point: Point2D) => u.x * (point.y - line.start.y) - u.y * (point.x - line.start.x);
  // O centro fica do lado da linha onde a curva foi escolhida, e do lado da curva onde a linha foi escolhida.
  const lineSide = sideOf(input.curvePick) >= 0 ? 1 : -1;
  const curveSide = isInsideCurve(curve, input.linePick) ? -1 : 1;
  const centerAt = (t: number): Point2D => {
    const point = curvePointAt(curve, t);
    const normal = curveNormalAt(curve, t);
    return { x: point.x + curveSide * radius * normal.x, y: point.y + curveSide * radius * normal.y };
  };
  const g = (t: number) => lineSide * sideOf(centerAt(t)) - radius;

  const roots: number[] = [];
  let previousT = 0;
  let previousValue = g(0);

  for (let index = 1; index <= SCAN_STEPS; index += 1) {
    const t = (TWO_PI * index) / SCAN_STEPS;
    const value = g(t);

    if (previousValue === 0) {
      roots.push(previousT);
    } else if (previousValue * value < 0) {
      roots.push(bisect(g, previousT, t, previousValue));
    }

    previousT = t;
    previousValue = value;
  }

  if (roots.length === 0) {
    return { ok: false, reason: "Radius too large or invalid" };
  }

  // Entre as soluções, a de tangência mais próxima dos dois pontos clicados.
  const project = (point: Point2D) => (point.x - line.start.x) * u.x + (point.y - line.start.y) * u.y;
  let best: { t: number; score: number } | null = null;

  for (const t of roots) {
    const center = centerAt(t);
    const tangentOnCurve = curvePointAt(curve, t);
    const along = project(center);
    const tangentOnLine = { x: line.start.x + u.x * along, y: line.start.y + u.y * along };
    const score = Math.hypot(tangentOnCurve.x - input.curvePick.x, tangentOnCurve.y - input.curvePick.y)
      + Math.hypot(tangentOnLine.x - input.linePick.x, tangentOnLine.y - input.linePick.y);

    if (best === null || score < best.score) {
      best = { t, score };
    }
  }

  const t = best!.t;
  const center = centerAt(t);
  const tangentOnCurve = curvePointAt(curve, t);
  const tangentAlong = project(center);
  const tangentOnLine = { x: line.start.x + u.x * tangentAlong, y: line.start.y + u.y * tangentAlong };

  let curveSpan: CurveSpan | null = null;

  if (input.span !== null) {
    const span = input.span;
    const tangentOffset = wrapAngle(t - span.start);

    if (tangentOffset > span.sweep + 1e-9) {
      return { ok: false, reason: "Fillet point is outside the arc" };
    }

    const pickOffset = wrapAngle(curveParamAt(curve, input.curvePick) - span.start);
    // Mantém o lado da faixa onde a curva foi clicada.
    curveSpan = pickOffset <= tangentOffset
      ? { start: span.start, sweep: tangentOffset }
      : { start: span.start + tangentOffset, sweep: span.sweep - tangentOffset };

    if (curveSpan.sweep <= 1e-9) {
      return { ok: false, reason: "Radius too large or invalid" };
    }
  }

  // A linha vai até a tangência, mantendo a ponta do lado do clique.
  const pickAlong = project(input.linePick);
  const lineResult = pickAlong <= tangentAlong
    ? { start: line.start, end: tangentOnLine }
    : { start: tangentOnLine, end: line.end };

  if (Math.hypot(lineResult.end.x - lineResult.start.x, lineResult.end.y - lineResult.start.y) <= 1e-9) {
    return { ok: false, reason: "Radius too large or invalid" };
  }

  // Arco menor entre as tangências (sempre < 180°); clockwise = true cresce o ângulo do mundo.
  const startAngle = Math.atan2(tangentOnLine.y - center.y, tangentOnLine.x - center.x);
  const endAngle = Math.atan2(tangentOnCurve.y - center.y, tangentOnCurve.x - center.x);
  const clockwise = wrapAngle(endAngle - startAngle) <= Math.PI;

  return {
    ok: true,
    arc: { center, radius, startAngle, endAngle, clockwise },
    line: lineResult,
    curveSpan,
    tangentOnLine,
    tangentOnCurve
  };
}

function bisect(f: (t: number) => number, low: number, high: number, lowValue: number): number {
  let a = low;
  let b = high;
  let fa = lowValue;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (a + b) / 2;
    const fm = f(middle);

    if (fm === 0 || b - a < 1e-15) {
      return middle;
    }

    if (fa * fm < 0) {
      b = middle;
    } else {
      a = middle;
      fa = fm;
    }
  }

  return (a + b) / 2;
}
