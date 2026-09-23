import { ellipseParamAtPoint, normalizeEllipseSweep, isFullEllipse } from "./ellipse";
import type { IntersectPrimitive } from "./intersections";
import type { BoundingBox, Matrix2D, Point2D, Vector2D } from "./types";

/**
 * Spline como cadeia de curvas de Bézier cúbicas: [P0, C1, C2, P1, C1, C2, P2, ...] (3n + 1 pontos).
 * É uma B-spline cúbica com nós de multiplicidade 3 (uma NURBS não racional), exata para o desenho
 * (Canvas e SVG desenham Béziers nativamente) e fechada sob transformações afins: mover, girar, escalar
 * e espelhar é só transformar os pontos de controle.
 *
 * O parâmetro global u vai de 0 a n (n = número de segmentos): o segmento é ⌊u⌋ e o local é u − ⌊u⌋.
 */

export type BezierChain = ReadonlyArray<Point2D>;
type Cubic = readonly [Point2D, Point2D, Point2D, Point2D];

export function bezierSegmentCount(chain: BezierChain): number {
  return chain.length >= 4 ? Math.floor((chain.length - 1) / 3) : 0;
}

export function isValidBezierChain(chain: BezierChain): boolean {
  return chain.length >= 4 && (chain.length - 1) % 3 === 0;
}

function cubicAt(chain: BezierChain, index: number): Cubic {
  const base = index * 3;
  return [chain[base]!, chain[base + 1]!, chain[base + 2]!, chain[base + 3]!];
}

export function cubicPoint([p0, p1, p2, p3]: Cubic, t: number): Point2D {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

export function cubicDerivative([p0, p1, p2, p3]: Cubic, t: number): Vector2D {
  const mt = 1 - t;
  const a = 3 * mt * mt;
  const b = 6 * mt * t;
  const c = 3 * t * t;
  return {
    x: a * (p1.x - p0.x) + b * (p2.x - p1.x) + c * (p3.x - p2.x),
    y: a * (p1.y - p0.y) + b * (p2.y - p1.y) + c * (p3.y - p2.y)
  };
}

function locate(chain: BezierChain, u: number): Readonly<{ index: number; t: number }> {
  const n = bezierSegmentCount(chain);
  const clamped = Math.max(0, Math.min(n, u));
  const index = Math.min(n - 1, Math.floor(clamped));
  return { index, t: clamped - index };
}

export function evaluateBezierChain(chain: BezierChain, u: number): Point2D {
  const { index, t } = locate(chain, u);
  return cubicPoint(cubicAt(chain, index), t);
}

export function bezierChainDerivative(chain: BezierChain, u: number): Vector2D {
  const { index, t } = locate(chain, u);
  return cubicDerivative(cubicAt(chain, index), t);
}

// Divide uma cúbica em t pelo algoritmo de de Casteljau.
export function splitCubic(cubic: Cubic, t: number): readonly [Cubic, Cubic] {
  const [p0, p1, p2, p3] = cubic;
  const lerp = (a: Point2D, b: Point2D): Point2D => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const p01 = lerp(p0, p1);
  const p12 = lerp(p1, p2);
  const p23 = lerp(p2, p3);
  const p012 = lerp(p01, p12);
  const p123 = lerp(p12, p23);
  const p0123 = lerp(p012, p123);
  return [[p0, p01, p012, p0123], [p0123, p123, p23, p3]];
}

/**
 * Trecho da cadeia entre u0 < u1 (ambos em [0, n]), como nova cadeia.
 */
export function subBezierChain(chain: BezierChain, u0: number, u1: number): BezierChain {
  const n = bezierSegmentCount(chain);
  const from = Math.max(0, Math.min(n, u0));
  const to = Math.max(from, Math.min(n, u1));
  const result: Point2D[] = [];

  for (let index = Math.min(n - 1, Math.floor(from)); index < n; index += 1) {
    const segmentStart = index;
    const segmentEnd = index + 1;
    if (segmentStart >= to) break;

    let cubic = cubicAt(chain, index);
    const localFrom = Math.max(0, from - segmentStart);
    const localTo = Math.min(1, to - segmentStart);

    if (localTo <= localFrom + 1e-15) continue;

    if (localTo < 1) cubic = splitCubic(cubic, localTo)[0];
    if (localFrom > 0) cubic = splitCubic(cubic, localFrom / localTo)[1];

    if (result.length === 0) result.push(cubic[0]);
    result.push(cubic[1], cubic[2], cubic[3]);

    if (segmentEnd >= to) break;
  }

  return result;
}

export function transformBezierChain(chain: BezierChain, matrix: Matrix2D): BezierChain {
  return chain.map((point) => ({
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f
  }));
}

// ------------------------------------------------------------------------------------------------
// Interpolação C2 por pontos de ajuste
// ------------------------------------------------------------------------------------------------

/**
 * Spline cúbica C2 que passa pelos pontos de ajuste, com parametrização pelo comprimento das cordas.
 * Aberta: condição natural nas pontas (curvatura zero). Fechada: periódica (sem quina no fechamento).
 * Pontos repetidos em sequência são ignorados. Com dois pontos, o resultado é um segmento reto.
 */
export function fitPointsToBezierChain(fitPoints: ReadonlyArray<Point2D>, closed: boolean): BezierChain {
  const points = dedupeFitPoints(fitPoints, closed);
  const m = points.length;

  if (m < 2) {
    return [];
  }

  if (closed && m >= 3) {
    const h = points.map((point, index) => distanceOf(point, points[(index + 1) % m]!));
    const sub = points.map((_, index) => h[(index - 1 + m) % m]!);
    const diag = points.map((_, index) => 2 * (h[(index - 1 + m) % m]! + h[index]!));
    const sup = h.slice();
    const rhs = (axis: "x" | "y") => points.map((point, index) => {
      const next = points[(index + 1) % m]!;
      const previous = points[(index - 1 + m) % m]!;
      return 6 * ((next[axis] - point[axis]) / h[index]! - (point[axis] - previous[axis]) / h[(index - 1 + m) % m]!);
    });
    const mx = solveCyclicTridiagonal(sub, diag, sup, rhs("x"));
    const my = solveCyclicTridiagonal(sub, diag, sup, rhs("y"));
    const moments = points.map((_, index) => ({ x: mx[index]!, y: my[index]! }));

    return hermiteChain([...points, points[0]!], [...h], [...moments, moments[0]!]);
  }

  const h = points.slice(0, -1).map((point, index) => distanceOf(point, points[index + 1]!));
  const moments: Point2D[] = points.map(() => ({ x: 0, y: 0 }));

  if (m > 2) {
    // Momentos internos M1..M(m−2) com M0 = M(m−1) = 0 (spline natural).
    const count = m - 2;
    const sub: number[] = [];
    const diag: number[] = [];
    const sup: number[] = [];
    const rx: number[] = [];
    const ry: number[] = [];

    for (let row = 0; row < count; row += 1) {
      const index = row + 1;
      sub.push(h[index - 1]!);
      diag.push(2 * (h[index - 1]! + h[index]!));
      sup.push(h[index]!);
      const point = points[index]!;
      const next = points[index + 1]!;
      const previous = points[index - 1]!;
      rx.push(6 * ((next.x - point.x) / h[index]! - (point.x - previous.x) / h[index - 1]!));
      ry.push(6 * ((next.y - point.y) / h[index]! - (point.y - previous.y) / h[index - 1]!));
    }

    const mx = solveTridiagonal(sub, diag, sup, rx);
    const my = solveTridiagonal(sub, diag, sup, ry);
    for (let row = 0; row < count; row += 1) moments[row + 1] = { x: mx[row]!, y: my[row]! };
  }

  return hermiteChain(points, h, moments);
}

// Converte a spline cúbica (pontos, intervalos e momentos) em cadeia de Béziers.
function hermiteChain(points: ReadonlyArray<Point2D>, h: ReadonlyArray<number>, moments: ReadonlyArray<Point2D>): BezierChain {
  const chain: Point2D[] = [points[0]!];

  for (let index = 0; index < points.length - 1; index += 1) {
    const p = points[index]!;
    const q = points[index + 1]!;
    const step = h[index]!;
    const mi = moments[index]!;
    const mj = moments[index + 1]!;
    const slope = { x: (q.x - p.x) / step, y: (q.y - p.y) / step };
    const startDerivative = { x: slope.x - (step * (2 * mi.x + mj.x)) / 6, y: slope.y - (step * (2 * mi.y + mj.y)) / 6 };
    const endDerivative = { x: slope.x + (step * (mi.x + 2 * mj.x)) / 6, y: slope.y + (step * (mi.y + 2 * mj.y)) / 6 };

    chain.push(
      { x: p.x + (startDerivative.x * step) / 3, y: p.y + (startDerivative.y * step) / 3 },
      { x: q.x - (endDerivative.x * step) / 3, y: q.y - (endDerivative.y * step) / 3 },
      q
    );
  }

  return chain;
}

function dedupeFitPoints(points: ReadonlyArray<Point2D>, closed: boolean): Point2D[] {
  const result: Point2D[] = [];

  for (const point of points) {
    const last = result[result.length - 1];
    if (last === undefined || distanceOf(last, point) > 1e-12) result.push(point);
  }

  if (closed && result.length > 1 && distanceOf(result[0]!, result[result.length - 1]!) <= 1e-12) {
    result.pop();
  }

  return result;
}

// Algoritmo de Thomas para sistemas tridiagonais (sub[0] e sup[n−1] não são usados).
function solveTridiagonal(sub: ReadonlyArray<number>, diag: ReadonlyArray<number>, sup: ReadonlyArray<number>, rhs: ReadonlyArray<number>): number[] {
  const n = diag.length;
  const c: number[] = new Array(n).fill(0);
  const d: number[] = new Array(n).fill(0);
  c[0] = sup[0]! / diag[0]!;
  d[0] = rhs[0]! / diag[0]!;

  for (let index = 1; index < n; index += 1) {
    const denominator = diag[index]! - sub[index]! * c[index - 1]!;
    c[index] = sup[index]! / denominator;
    d[index] = (rhs[index]! - sub[index]! * d[index - 1]!) / denominator;
  }

  const x: number[] = new Array(n).fill(0);
  x[n - 1] = d[n - 1]!;
  for (let index = n - 2; index >= 0; index -= 1) x[index] = d[index]! - c[index]! * x[index + 1]!;
  return x;
}

// Sistema tridiagonal cíclico (sub[0] está na coluna n−1 e sup[n−1] na coluna 0), por Sherman–Morrison.
function solveCyclicTridiagonal(sub: ReadonlyArray<number>, diag: ReadonlyArray<number>, sup: ReadonlyArray<number>, rhs: ReadonlyArray<number>): number[] {
  const n = diag.length;
  const alpha = sup[n - 1]!;
  const beta = sub[0]!;
  const gamma = -diag[0]!;
  const modified = diag.slice();
  modified[0] = diag[0]! - gamma;
  modified[n - 1] = diag[n - 1]! - (alpha * beta) / gamma;
  const x = solveTridiagonal(sub, modified, sup, rhs);
  const u = new Array(n).fill(0);
  u[0] = gamma;
  u[n - 1] = alpha;
  const z = solveTridiagonal(sub, modified, sup, u);
  const factor = (x[0]! + (beta * x[n - 1]!) / gamma) / (1 + z[0]! + (beta * z[n - 1]!) / gamma);
  return x.map((value, index) => value - factor * z[index]!);
}

// ------------------------------------------------------------------------------------------------
// Medidas
// ------------------------------------------------------------------------------------------------

/**
 * Envoltório exato: além das pontas, os extremos de cada segmento ocorrem onde a derivada de x ou de y
 * se anula (raízes de uma quadrática).
 */
export function bezierChainBoundingBox(chain: BezierChain): BoundingBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const include = (point: Point2D) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };

  for (let index = 0; index < bezierSegmentCount(chain); index += 1) {
    const cubic = cubicAt(chain, index);
    include(cubic[0]);
    include(cubic[3]);

    for (const axis of ["x", "y"] as const) {
      const [p0, p1, p2, p3] = cubic.map((point) => point[axis]) as [number, number, number, number];
      // B'(t)/3 = a·t² + b·t + c
      const a = -p0 + 3 * p1 - 3 * p2 + p3;
      const b = 2 * (p0 - 2 * p1 + p2);
      const c = p1 - p0;
      for (const t of quadraticRoots(a, b, c)) {
        if (t > 0 && t < 1) include(cubicPoint(cubic, t));
      }
    }
  }

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (Math.abs(a) < 1e-14) {
    return Math.abs(b) < 1e-14 ? [] : [-c / b];
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

// Quadratura de Gauss–Legendre (8 pontos) em [a, b] da velocidade |B'(t)| de uma cúbica.
const GAUSS_NODES = [-0.9602898564975363, -0.7966664774136267, -0.525532409916329, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
const GAUSS_WEIGHTS = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];

function cubicLength(cubic: Cubic, from = 0, to = 1): number {
  // Quatro subintervalos com Gauss de 8 pontos: erro desprezível para curvas de desenho.
  let total = 0;
  const pieces = 4;
  const step = (to - from) / pieces;

  for (let piece = 0; piece < pieces; piece += 1) {
    const a = from + piece * step;
    const half = step / 2;
    const middle = a + half;
    for (let index = 0; index < GAUSS_NODES.length; index += 1) {
      const derivative = cubicDerivative(cubic, middle + half * GAUSS_NODES[index]!);
      total += GAUSS_WEIGHTS[index]! * half * Math.hypot(derivative.x, derivative.y);
    }
  }

  return total;
}

export function bezierChainLength(chain: BezierChain): number {
  let total = 0;
  for (let index = 0; index < bezierSegmentCount(chain); index += 1) total += cubicLength(cubicAt(chain, index));
  return total;
}

// Parâmetro u da cadeia na distância s ao longo dela (busca por bisseção dentro do segmento).
export function bezierChainParamAtLength(chain: BezierChain, s: number): number {
  const n = bezierSegmentCount(chain);
  let remaining = Math.max(0, s);

  for (let index = 0; index < n; index += 1) {
    const cubic = cubicAt(chain, index);
    const length = cubicLength(cubic);

    if (remaining <= length || index === n - 1) {
      let low = 0;
      let high = 1;
      for (let iteration = 0; iteration < 50; iteration += 1) {
        const middle = (low + high) / 2;
        if (cubicLength(cubic, 0, middle) < remaining) low = middle;
        else high = middle;
      }
      return index + Math.min(1, (low + high) / 2);
    }

    remaining -= length;
  }

  return n;
}

export type BezierChainHit = Readonly<{ u: number; point: Point2D; distance: number }>;

/**
 * Ponto da cadeia mais próximo de point: amostragem grossa por segmento e refinamento por seção áurea.
 */
export function nearestOnBezierChain(chain: BezierChain, point: Point2D): BezierChainHit {
  const n = bezierSegmentCount(chain);
  const samples = 32;
  let best = { index: 0, t: 0, distanceSquared: Number.POSITIVE_INFINITY };

  for (let index = 0; index < n; index += 1) {
    const cubic = cubicAt(chain, index);
    for (let step = 0; step <= samples; step += 1) {
      const t = step / samples;
      const candidate = cubicPoint(cubic, t);
      const distanceSquared = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
      if (distanceSquared < best.distanceSquared) best = { index, t, distanceSquared };
    }
  }

  const cubic = cubicAt(chain, best.index);
  let low = Math.max(0, best.t - 1 / samples);
  let high = Math.min(1, best.t + 1 / samples);
  const ratio = (Math.sqrt(5) - 1) / 2;
  const f = (t: number) => {
    const candidate = cubicPoint(cubic, t);
    return (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
  };

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const a = high - ratio * (high - low);
    const b = low + ratio * (high - low);
    if (f(a) < f(b)) high = b;
    else low = a;
  }

  const t = (low + high) / 2;
  const nearest = cubicPoint(cubic, t);
  return { u: best.index + t, point: nearest, distance: Math.hypot(nearest.x - point.x, nearest.y - point.y) };
}

/**
 * Polyline que aproxima a cadeia com desvio máximo menor que tolerance (subdivisão adaptativa pela
 * planicidade do polígono de controle). Usada para interseções, snaps e seleção.
 */
export function flattenBezierChain(chain: BezierChain, tolerance?: number): Point2D[] {
  if (!isValidBezierChain(chain)) return [...chain];

  const box = bezierChainBoundingBox(chain);
  const size = Math.max(box.maxX - box.minX, box.maxY - box.minY, 1e-9);
  const limit = tolerance ?? size * 1e-7;
  const points: Point2D[] = [chain[0]!];

  const recurse = (cubic: Cubic, depth: number) => {
    if (depth >= 18 || cubicFlatness(cubic) <= limit) {
      points.push(cubic[3]);
      return;
    }

    const [left, right] = splitCubic(cubic, 0.5);
    recurse(left, depth + 1);
    recurse(right, depth + 1);
  };

  for (let index = 0; index < bezierSegmentCount(chain); index += 1) recurse(cubicAt(chain, index), 0);
  return points;
}

// Desvio máximo dos pontos de controle internos em relação à corda (limite do desvio da curva).
function cubicFlatness([p0, p1, p2, p3]: Cubic): number {
  const dx = p3.x - p0.x;
  const dy = p3.y - p0.y;
  const length = Math.hypot(dx, dy);

  if (length < 1e-15) {
    return Math.max(distanceOf(p0, p1), distanceOf(p0, p2));
  }

  const distance = (p: Point2D) => Math.abs((p.x - p0.x) * dy - (p.y - p0.y) * dx) / length;
  // Pontos de controle além das pontas (fora da projeção na corda) também contam.
  const along = (p: Point2D) => ((p.x - p0.x) * dx + (p.y - p0.y) * dy) / length;
  const overshoot = (p: Point2D) => Math.max(0, -along(p), along(p) - length);
  return Math.max(distance(p1), distance(p2), overshoot(p1), overshoot(p2));
}

// ------------------------------------------------------------------------------------------------
// Interseções
// ------------------------------------------------------------------------------------------------

/**
 * Parâmetros u onde a cadeia cruza uma primitiva. Cada segmento é varrido em busca de troca de sinal
 * da função implícita da primitiva (reta, círculo, elipse) e a raiz é refinada por bisseção; depois
 * vale o limite da primitiva (extensão do segmento, faixa do arco, varredura do arco de elipse).
 */
export function bezierChainIntersectionParams(chain: BezierChain, primitive: IntersectPrimitive, samplesPerSegment = 64): ReadonlyArray<number> {
  const implicit = implicitOf(primitive);
  const params: number[] = [];

  for (let index = 0; index < bezierSegmentCount(chain); index += 1) {
    const cubic = cubicAt(chain, index);
    const f = (t: number) => implicit.value(cubicPoint(cubic, t));
    let previousT = 0;
    let previousValue = f(0);

    for (let step = 1; step <= samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      const value = f(t);
      let root: number | null = null;

      if (previousValue === 0) root = previousT;
      else if (previousValue * value < 0) root = bisect(f, previousT, t, previousValue);

      if (root !== null && implicit.accept(cubicPoint(cubic, root))) params.push(index + root);

      previousT = t;
      previousValue = value;
    }

    if (previousValue === 0 && implicit.accept(cubic[3])) params.push(index + 1);
  }

  const unique: number[] = [];
  for (const u of params.sort((a, b) => a - b)) {
    if (unique.length === 0 || u - unique[unique.length - 1]! > 1e-9) unique.push(u);
  }
  return unique;
}

type Implicit = Readonly<{ value: (point: Point2D) => number; accept: (point: Point2D) => boolean }>;

function implicitOf(primitive: IntersectPrimitive): Implicit {
  if (primitive.kind === "segment") {
    const dx = primitive.b.x - primitive.a.x;
    const dy = primitive.b.y - primitive.a.y;
    const lengthSquared = dx * dx + dy * dy;
    return {
      value: (p) => (p.x - primitive.a.x) * dy - (p.y - primitive.a.y) * dx,
      accept: (p) => {
        const t = lengthSquared > 0 ? ((p.x - primitive.a.x) * dx + (p.y - primitive.a.y) * dy) / lengthSquared : 0;
        return t >= -1e-9 && t <= 1 + 1e-9;
      }
    };
  }

  if (primitive.kind === "circle") {
    return {
      value: (p) => (p.x - primitive.center.x) ** 2 + (p.y - primitive.center.y) ** 2 - primitive.radius ** 2,
      accept: (p) => {
        if (primitive.arc === undefined) return true;
        const angle = Math.atan2(p.y - primitive.center.y, p.x - primitive.center.x);
        const { startAngle, endAngle, clockwise } = primitive.arc;
        const sweep = wrapAngle(clockwise ? endAngle - startAngle : startAngle - endAngle) || Math.PI * 2;
        const offset = wrapAngle(clockwise ? angle - startAngle : startAngle - angle);
        return offset <= sweep + 1e-9;
      }
    };
  }

  const ellipse = primitive.ellipse;
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  return {
    value: (p) => {
      const dx = p.x - ellipse.center.x;
      const dy = p.y - ellipse.center.y;
      const x = (dx * cos + dy * sin) / ellipse.radiusX;
      const y = (-dx * sin + dy * cos) / ellipse.radiusY;
      return x * x + y * y - 1;
    },
    accept: (p) => {
      if (isFullEllipse(ellipse)) return true;
      const { start, sweep } = normalizeEllipseSweep(ellipse.startAngle!, ellipse.endAngle!);
      const param = ellipseParamAtPoint(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, p);
      return wrapAngle(param - start) <= sweep + 1e-9;
    }
  };
}

function bisect(f: (t: number) => number, low: number, high: number, lowValue: number): number {
  let a = low;
  let b = high;
  let fa = lowValue;

  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (a + b) / 2;
    const value = f(middle);
    if (value === 0) return middle;
    if (fa * value < 0) b = middle;
    else {
      a = middle;
      fa = value;
    }
  }

  return (a + b) / 2;
}

// ------------------------------------------------------------------------------------------------
// Ajuste de curvas paramétricas (offset)
// ------------------------------------------------------------------------------------------------

/**
 * Aproxima uma curva paramétrica f em [t0, t1] por uma cadeia de Béziers, por interpolação de Hermite
 * (pontos e tangentes nas pontas de cada trecho) com subdivisão até o erro ficar abaixo de tolerance.
 */
export function fitParametricCurve(
  f: (t: number) => Point2D,
  t0: number,
  t1: number,
  tolerance: number,
  initialPieces = 4
): BezierChain {
  const derivative = (t: number): Vector2D => {
    const h = Math.max(1e-7, Math.abs(t1 - t0) * 1e-7);
    const a = f(t - h);
    const b = f(t + h);
    return { x: (b.x - a.x) / (2 * h), y: (b.y - a.y) / (2 * h) };
  };
  const chain: Point2D[] = [f(t0)];

  const fit = (a: number, b: number, depth: number) => {
    const p0 = f(a);
    const p3 = f(b);
    const d0 = derivative(a);
    const d3 = derivative(b);
    const span = b - a;
    const cubic: Cubic = [p0, { x: p0.x + (d0.x * span) / 3, y: p0.y + (d0.y * span) / 3 }, { x: p3.x - (d3.x * span) / 3, y: p3.y - (d3.y * span) / 3 }, p3];
    let error = 0;

    for (const s of [0.25, 0.5, 0.75]) {
      const approx = cubicPoint(cubic, s);
      const exact = f(a + s * span);
      error = Math.max(error, Math.hypot(approx.x - exact.x, approx.y - exact.y));
    }

    if (error > tolerance && depth < 14) {
      fit(a, a + span / 2, depth + 1);
      fit(a + span / 2, b, depth + 1);
      return;
    }

    chain.push(cubic[1], cubic[2], p3);
  };

  const step = (t1 - t0) / initialPieces;
  for (let piece = 0; piece < initialPieces; piece += 1) fit(t0 + piece * step, t0 + (piece + 1) * step, 0);
  return chain;
}

/**
 * Offset de uma cadeia de Béziers: cada segmento vira a curva paralela P(t) + d·N(t), ajustada por
 * Béziers (Hermite). O lado é o do ponto indicado em relação à curva.
 */
export function offsetBezierChain(chain: BezierChain, offsetDistance: number, sidePoint: Point2D): BezierChain | null {
  if (!(offsetDistance > 0) || !isValidBezierChain(chain)) return null;

  const nearest = nearestOnBezierChain(chain, sidePoint);
  const tangent = safeDerivative(chain, nearest.u);
  const side = tangent.x * (sidePoint.y - nearest.point.y) - tangent.y * (sidePoint.x - nearest.point.x) >= 0 ? 1 : -1;
  const box = bezierChainBoundingBox(chain);
  const tolerance = Math.max(box.maxX - box.minX, box.maxY - box.minY, offsetDistance) * 1e-6;
  const result: Point2D[] = [];

  for (let index = 0; index < bezierSegmentCount(chain); index += 1) {
    const offsetPoint = (t: number): Point2D => {
      const u = index + Math.max(0, Math.min(1, t));
      const point = evaluateBezierChain(chain, u);
      const derivative = safeDerivative(chain, u);
      const length = Math.hypot(derivative.x, derivative.y) || 1;
      // Normal à esquerda da tangente (−dy, dx), no sentido pedido.
      return { x: point.x - (side * offsetDistance * derivative.y) / length, y: point.y + (side * offsetDistance * derivative.x) / length };
    };
    const piece = fitParametricCurve(offsetPoint, 0, 1, tolerance, 1);
    result.push(...(result.length === 0 ? piece : piece.slice(1)));
  }

  return result;
}

// Derivada que não se anula em pontas com alça de comprimento zero (usa um ponto vizinho).
function safeDerivative(chain: BezierChain, u: number): Vector2D {
  const derivative = bezierChainDerivative(chain, u);

  if (Math.hypot(derivative.x, derivative.y) > 1e-12) return derivative;

  const n = bezierSegmentCount(chain);
  const nudge = u >= n ? u - 1e-6 : u + 1e-6;
  const fallback = bezierChainDerivative(chain, nudge);
  return fallback;
}

function wrapAngle(angle: number): number {
  const wrapped = angle % (Math.PI * 2);
  return wrapped < 0 ? wrapped + Math.PI * 2 : wrapped;
}

function distanceOf(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ------------------------------------------------------------------------------------------------
// Caches (as cadeias das entidades são imutáveis: o array de pontos serve de chave)
// ------------------------------------------------------------------------------------------------

const flattenCache = new WeakMap<BezierChain, Point2D[]>();
const midpointCache = new WeakMap<BezierChain, Point2D>();

// Polyline de alta precisão da cadeia, calculada uma vez por cadeia (snaps, seleção, interseções).
export function cachedFlattenBezierChain(chain: BezierChain): ReadonlyArray<Point2D> {
  let points = flattenCache.get(chain);
  if (points === undefined) {
    points = flattenBezierChain(chain);
    flattenCache.set(chain, points);
  }
  return points;
}

// Ponto na metade do comprimento da cadeia (snap Midpoint), calculado uma vez por cadeia.
export function bezierChainMidpoint(chain: BezierChain): Point2D {
  let point = midpointCache.get(chain);
  if (point === undefined) {
    point = evaluateBezierChain(chain, bezierChainParamAtLength(chain, bezierChainLength(chain) / 2));
    midpointCache.set(chain, point);
  }
  return point;
}
