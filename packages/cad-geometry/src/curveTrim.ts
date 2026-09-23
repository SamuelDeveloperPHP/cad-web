import { arcSweepAngle, isAngleOnArc } from "./arc";
import { CAD_EPSILON } from "./constants";
import { ellipseParamAtPoint, ellipsePointAtParam, isFullEllipse, normalizeEllipseSweep, type EllipseGeometry } from "./ellipse";
import { intersectPrimitives, type IntersectPrimitive } from "./intersections";
import type { Point2D } from "./types";
import type { ExtendCandidate, ExtendEndpoint } from "./extend";
import { findLineSegmentAtPoint, splitLineByParameters, type TrimLineEntity, type TrimLineResult } from "./trim";

/**
 * Núcleo genérico de Trim/Extend para qualquer entidade que se reduz a primitivas de interseção
 * (segmentos, círculos/arcos, elipses/arcos de elipse):
 * - reta infinita × primitiva, devolvendo o parâmetro na reta (usado para aparar e estender linhas);
 * - curvas periódicas (círculo, arco, elipse, arco de elipse) descritas por um parâmetro angular e,
 *   quando abertas, por uma faixa [início, início + varredura] sempre crescente no mundo.
 */

const TWO_PI = Math.PI * 2;

export type LineIntersectionHit = Readonly<{ parameter: number; point: Point2D }>;

/**
 * Interseções da reta infinita que passa por a (t = 0) e b (t = 1) com uma primitiva limitada
 * (o segmento, a faixa do arco ou a varredura do arco de elipse são respeitados; a reta não).
 */
export function lineIntersectionParameters(
  a: Point2D,
  b: Point2D,
  primitive: IntersectPrimitive,
  epsilon = CAD_EPSILON
): ReadonlyArray<LineIntersectionHit> {
  const d = { x: b.x - a.x, y: b.y - a.y };
  const lengthSquared = d.x * d.x + d.y * d.y;

  if (lengthSquared <= epsilon * epsilon) {
    return [];
  }

  const at = (t: number): LineIntersectionHit => ({ parameter: t, point: { x: a.x + d.x * t, y: a.y + d.y * t } });

  if (primitive.kind === "segment") {
    const s = { x: primitive.b.x - primitive.a.x, y: primitive.b.y - primitive.a.y };
    const denominator = d.x * s.y - d.y * s.x;

    if (Math.abs(denominator) <= epsilon) {
      return [];
    }

    const delta = { x: primitive.a.x - a.x, y: primitive.a.y - a.y };
    const t = (delta.x * s.y - delta.y * s.x) / denominator;
    const u = (delta.x * d.y - delta.y * d.x) / denominator;

    return u >= -1e-9 && u <= 1 + 1e-9 ? [at(t)] : [];
  }

  if (primitive.kind === "circle") {
    const f = { x: a.x - primitive.center.x, y: a.y - primitive.center.y };
    const roots = solveQuadratic(lengthSquared, 2 * (f.x * d.x + f.y * d.y), f.x * f.x + f.y * f.y - primitive.radius * primitive.radius);

    return roots.map(at).filter((hit) => {
      if (primitive.arc === undefined) return true;
      const angle = Math.atan2(hit.point.y - primitive.center.y, hit.point.x - primitive.center.x);
      return isAngleOnArc(angle, primitive.arc.startAngle, primitive.arc.endAngle, primitive.arc.clockwise, 1e-9);
    });
  }

  // Elipse: no espaço normalizado (des-rotacionado e dividido pelos semi-eixos) ela vira o círculo unitário.
  const ellipse = primitive.ellipse;
  const cos = Math.cos(ellipse.rotation);
  const sin = Math.sin(ellipse.rotation);
  const toLocal = (p: Point2D): Point2D => {
    const dx = p.x - ellipse.center.x;
    const dy = p.y - ellipse.center.y;
    return { x: (dx * cos + dy * sin) / ellipse.radiusX, y: (-dx * sin + dy * cos) / ellipse.radiusY };
  };
  const la = toLocal(a);
  const lb = toLocal(b);
  const ld = { x: lb.x - la.x, y: lb.y - la.y };
  const roots = solveQuadratic(ld.x * ld.x + ld.y * ld.y, 2 * (la.x * ld.x + la.y * ld.y), la.x * la.x + la.y * la.y - 1);

  return roots.map(at).filter((hit) => isParamInEllipseSweep(ellipse, ellipseParamAtPoint(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, hit.point)));
}

function solveQuadratic(a: number, b: number, c: number): ReadonlyArray<number> {
  if (Math.abs(a) <= 1e-18) {
    return [];
  }

  const discriminant = b * b - 4 * a * c;
  // Tolerância relativa: tangência numérica vira uma raiz dupla.
  const scale = Math.max(b * b, Math.abs(4 * a * c), 1e-30);

  if (discriminant < -1e-12 * scale) {
    return [];
  }

  if (discriminant <= 1e-12 * scale) {
    return [-b / (2 * a)];
  }

  const root = Math.sqrt(discriminant);
  return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function isParamInEllipseSweep(ellipse: EllipseGeometry, param: number): boolean {
  if (isFullEllipse(ellipse)) {
    return true;
  }

  const { start, sweep } = normalizeEllipseSweep(ellipse.startAngle!, ellipse.endAngle!);
  return wrapAngle(param - start) <= sweep + 1e-9;
}

// ------------------------------------------------------------------------------------------------
// Curvas periódicas
// ------------------------------------------------------------------------------------------------

export type PeriodicCurve =
  | Readonly<{ kind: "circle"; center: Point2D; radius: number }>
  | Readonly<{ kind: "ellipse"; center: Point2D; radiusX: number; radiusY: number; rotation: number }>;

// Faixa aberta da curva: começa em start e cresce sweep (0 < sweep < 2π). null = curva fechada.
export type CurveSpan = Readonly<{ start: number; sweep: number }>;

export type CurveTrimResult = Readonly<{
  kept: ReadonlyArray<CurveSpan>;
  removed: CurveSpan;
}>;

export function wrapAngle(angle: number): number {
  const wrapped = angle % TWO_PI;
  return wrapped < 0 ? wrapped + TWO_PI : wrapped;
}

export function curvePointAt(curve: PeriodicCurve, parameter: number): Point2D {
  if (curve.kind === "circle") {
    return { x: curve.center.x + curve.radius * Math.cos(parameter), y: curve.center.y + curve.radius * Math.sin(parameter) };
  }

  return ellipsePointAtParam(curve.center, curve.radiusX, curve.radiusY, curve.rotation, parameter);
}

export function curveParamAt(curve: PeriodicCurve, point: Point2D): number {
  if (curve.kind === "circle") {
    return Math.atan2(point.y - curve.center.y, point.x - curve.center.x);
  }

  return ellipseParamAtPoint(curve.center, curve.radiusX, curve.radiusY, curve.rotation, point);
}

// A primitiva da curva completa (sem faixa), usada para achar todas as interseções com os limites.
export function curvePrimitive(curve: PeriodicCurve): IntersectPrimitive {
  return curve.kind === "circle"
    ? { kind: "circle", center: curve.center, radius: curve.radius }
    : { kind: "ellipse", ellipse: { type: "ellipse", center: curve.center, radiusX: curve.radiusX, radiusY: curve.radiusY, rotation: curve.rotation } };
}

/**
 * Parâmetros (em [0, 2π)) onde a curva completa cruza as primitivas de corte/limite, sem repetições.
 */
export function curveIntersectionParams(
  curve: PeriodicCurve,
  primitives: ReadonlyArray<IntersectPrimitive>,
  samples = 180
): ReadonlyArray<number> {
  const full = curvePrimitive(curve);
  const params: number[] = [];

  for (const primitive of primitives) {
    for (const point of intersectPrimitives(full, primitive, samples)) {
      params.push(wrapAngle(curveParamAt(curve, point)));
    }
  }

  return uniqueAngles(params);
}

function uniqueAngles(angles: ReadonlyArray<number>, tolerance = 1e-7): ReadonlyArray<number> {
  const sorted = [...angles].sort((left, right) => left - right);
  const unique: number[] = [];

  for (const angle of sorted) {
    const last = unique[unique.length - 1];

    if (last === undefined || angle - last > tolerance) {
      unique.push(angle);
    }
  }

  // 0 e 2π são o mesmo ponto.
  if (unique.length > 1 && TWO_PI - unique[unique.length - 1]! + unique[0]! <= tolerance) {
    unique.pop();
  }

  return unique;
}

/**
 * Apara a curva removendo o trecho entre cortes que contém o parâmetro clicado.
 * - Curva fechada: exige pelo menos dois cortes (como o AutoCAD); sobra um único arco.
 * - Faixa aberta: sobram até dois pedaços (antes e depois do trecho removido).
 * Retorna null quando não há corte que delimite o trecho clicado.
 */
export function trimPeriodicCurve(
  span: CurveSpan | null,
  cutParams: ReadonlyArray<number>,
  clickParam: number,
  epsilon = 1e-9
): CurveTrimResult | null {
  if (span === null) {
    const cuts = uniqueAngles(cutParams.map(wrapAngle));

    if (cuts.length < 2) {
      return null;
    }

    const click = wrapAngle(clickParam);
    let index = cuts.length - 1;

    for (let i = 0; i < cuts.length; i += 1) {
      if (cuts[i]! <= click) {
        index = i;
      }
    }

    // Se o clique fica antes do primeiro corte, o trecho é o que atravessa 0 (do último ao primeiro).
    const from = click < cuts[0]! ? cuts[cuts.length - 1]! : cuts[index]!;
    const to = click < cuts[0]! ? cuts[0]! : cuts[(index + 1) % cuts.length]!;
    const removedSweep = wrapAngle(to - from) || TWO_PI;

    return {
      removed: { start: from, sweep: removedSweep },
      kept: removedSweep >= TWO_PI - epsilon ? [] : [{ start: to, sweep: TWO_PI - removedSweep }]
    };
  }

  const offsets = uniqueAngles(
    cutParams.map((param) => wrapAngle(param - span.start)).filter((offset) => offset > epsilon && offset < span.sweep - epsilon)
  );

  if (offsets.length === 0) {
    return null;
  }

  let clickOffset = wrapAngle(clickParam - span.start);

  // Um clique um pouco fora da faixa (tolerância de seleção) é levado à ponta mais próxima.
  if (clickOffset > span.sweep) {
    clickOffset = clickOffset - span.sweep < TWO_PI - clickOffset ? span.sweep : 0;
  }

  const bounds = [0, ...offsets, span.sweep];
  let index = 0;

  while (index < bounds.length - 2 && clickOffset > bounds[index + 1]!) {
    index += 1;
  }

  const from = bounds[index]!;
  const to = bounds[index + 1]!;
  const kept: CurveSpan[] = [];

  if (from > epsilon) {
    kept.push({ start: span.start, sweep: from });
  }

  if (span.sweep - to > epsilon) {
    kept.push({ start: span.start + to, sweep: span.sweep - to });
  }

  return { removed: { start: span.start + from, sweep: to - from }, kept };
}

/**
 * Estende a ponta de uma faixa aberta até a primeira interseção com os limites, seguindo a curva.
 * A extensão nunca ultrapassa a própria curva (não se sobrepõe à faixa existente).
 */
export function extendPeriodicCurve(
  span: CurveSpan,
  boundaryParams: ReadonlyArray<number>,
  endpoint: "start" | "end",
  epsilon = 1e-9
): CurveSpan | null {
  const gap = TWO_PI - span.sweep;
  let best: number | null = null;

  for (const param of boundaryParams) {
    const delta = endpoint === "end" ? wrapAngle(param - (span.start + span.sweep)) : wrapAngle(span.start - param);

    if (delta > epsilon && delta < gap - epsilon && (best === null || delta < best)) {
      best = delta;
    }
  }

  if (best === null) {
    return null;
  }

  return endpoint === "end"
    ? { start: span.start, sweep: span.sweep + best }
    : { start: span.start - best, sweep: span.sweep + best };
}

// ------------------------------------------------------------------------------------------------
// Adaptadores de entidade (estruturais, sem depender do cad-core)
// ------------------------------------------------------------------------------------------------

type CircleLike = Readonly<{ type: "circle"; center: Point2D; radius: number }>;
type ArcLike = Readonly<{ type: "arc"; center: Point2D; radius: number; startAngle: number; endAngle: number; clockwise: boolean }>;
type EllipseLike = Readonly<{
  type: "ellipse";
  center: Point2D;
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}>;

export type CurveEntityLike = CircleLike | ArcLike | EllipseLike;

export function curveOfEntity(entity: CurveEntityLike): Readonly<{ curve: PeriodicCurve; span: CurveSpan | null }> {
  if (entity.type === "circle") {
    return { curve: { kind: "circle", center: entity.center, radius: entity.radius }, span: null };
  }

  if (entity.type === "arc") {
    const sweep = arcSweepAngle(entity.startAngle, entity.endAngle, entity.clockwise) || TWO_PI;
    // O arco "clockwise" cresce no mundo a partir do início; o anti-horário cresce a partir do fim.
    return {
      curve: { kind: "circle", center: entity.center, radius: entity.radius },
      span: { start: entity.clockwise ? entity.startAngle : entity.endAngle, sweep }
    };
  }

  const curve: PeriodicCurve = { kind: "ellipse", center: entity.center, radiusX: entity.radiusX, radiusY: entity.radiusY, rotation: entity.rotation };

  if (entity.startAngle === undefined || entity.endAngle === undefined || isFullEllipse({ ...entity, type: "ellipse" })) {
    return { curve, span: null };
  }

  const { start, sweep } = normalizeEllipseSweep(entity.startAngle, entity.endAngle);
  return { curve, span: { start, sweep } };
}

/**
 * Cria a entidade de um pedaço da curva preservando os demais campos (id, camada, cor, estilo).
 * Círculos e arcos viram arcos com sentido crescente no mundo (clockwise = true); elipses viram arcos de elipse.
 */
export function entityWithSpan<T extends CurveEntityLike>(entity: T, span: CurveSpan): T | ArcLike {
  if (entity.type === "ellipse") {
    return { ...entity, startAngle: span.start, endAngle: span.start + span.sweep };
  }

  const { center, radius } = entity as CircleLike | ArcLike;
  const base = { ...(entity as object) } as Record<string, unknown>;
  delete base.type;

  return {
    ...(base as object),
    type: "arc",
    center,
    radius,
    startAngle: span.start,
    endAngle: span.start + span.sweep,
    clockwise: true
  } as ArcLike;
}

// Ponto da curva em cada extremo da faixa (início e fim no sentido crescente).
export function spanEndpoints(curve: PeriodicCurve, span: CurveSpan): Readonly<{ start: Point2D; end: Point2D }> {
  return { start: curvePointAt(curve, span.start), end: curvePointAt(curve, span.start + span.sweep) };
}

// ------------------------------------------------------------------------------------------------
// Linhas contra qualquer primitiva
// ------------------------------------------------------------------------------------------------

export type BoundaryPrimitive = Readonly<{ primitive: IntersectPrimitive; entityId?: string | undefined }>;

/**
 * Apara uma linha contra primitivas quaisquer (segmentos, círculos/arcos, elipses/arcos de elipse):
 * os cortes internos dividem a linha e o trecho clicado é removido.
 */
export function trimLineByPrimitives(
  target: TrimLineEntity,
  primitives: ReadonlyArray<IntersectPrimitive>,
  clickPoint: Point2D,
  toleranceWorld: number,
  epsilon = CAD_EPSILON
): TrimLineResult {
  const parameters: number[] = [];

  for (const primitive of primitives) {
    for (const hit of lineIntersectionParameters(target.start, target.end, primitive, epsilon)) {
      if (hit.parameter > 1e-9 && hit.parameter < 1 - 1e-9) {
        parameters.push(hit.parameter);
      }
    }
  }

  const segments = splitLineByParameters(target, parameters, 1e-9);
  const cutParameters = segments.slice(1).map((segment) => segment.fromParameter);

  if (cutParameters.length === 0) {
    return { cutParameters, resultLines: segments, removedSegment: null, warnings: ["No valid cutting edge found."], errors: [] };
  }

  const removedSegment = findLineSegmentAtPoint(segments, clickPoint, toleranceWorld);

  if (removedSegment === null) {
    return { cutParameters, resultLines: segments, removedSegment: null, warnings: ["No trim segment found at the picked point."], errors: [] };
  }

  return {
    cutParameters,
    resultLines: segments.filter((segment) => segment !== removedSegment),
    removedSegment,
    warnings: [],
    errors: []
  };
}

/**
 * Candidatos para estender a ponta de uma linha até primitivas quaisquer, do mais próximo ao mais distante.
 */
export function lineExtendCandidatesFromPrimitives(
  target: TrimLineEntity,
  boundaries: ReadonlyArray<BoundaryPrimitive>,
  endpoint: ExtendEndpoint,
  epsilon = CAD_EPSILON
): ReadonlyArray<ExtendCandidate> {
  const length = Math.hypot(target.end.x - target.start.x, target.end.y - target.start.y);
  const candidates: ExtendCandidate[] = [];

  if (length <= epsilon) {
    return candidates;
  }

  for (const boundary of boundaries) {
    for (const hit of lineIntersectionParameters(target.start, target.end, boundary.primitive, epsilon)) {
      const delta = endpoint === "start" ? -hit.parameter : hit.parameter - 1;

      if (delta <= 1e-9 || candidates.some((candidate) => Math.abs(candidate.targetParameter - hit.parameter) <= 1e-12)) {
        continue;
      }

      const candidate: ExtendCandidate = {
        endpoint,
        point: hit.point,
        targetParameter: hit.parameter,
        extensionDistance: delta * length,
        boundaryType: boundary.primitive.kind
      };
      candidates.push(boundary.entityId === undefined ? candidate : { ...candidate, boundaryId: boundary.entityId });
    }
  }

  return candidates.sort((left, right) => left.extensionDistance - right.extensionDistance);
}
