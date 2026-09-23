import { computeArcFromThreePoints } from "./arc";
import { curveOfEntity, spanEndpoints, wrapAngle, curvePointAt } from "./curveTrim";
import { ellipseParamAtPoint, ellipsePointAtParam, normalizeEllipseAxes, normalizeEllipseSweep } from "./ellipse";
import { getRectangleCorners } from "./explode";
import { fitPointsToBezierChain } from "./spline";
import { getSplineGripPoints, splineUsesFitGrips, updateSplineByGrip } from "./splineGrips";
import type { Point2D } from "./types";

/**
 * Grips (alças de edição) das entidades, no estilo do AutoCAD. Cada grip tem um id estável e a edição
 * é sempre calculada a partir da entidade original (o arrasto não acumula erro):
 * - linha: pontas (esticam) e ponto médio (move a linha);
 * - círculo: centro (move) e quadrantes (raio);
 * - arco: centro (move), pontas e ponto médio (arco por três pontos com os outros dois fixos);
 * - elipse: centro (move), quadrantes (raio do eixo, os eixos são renormalizados) e, no arco de elipse,
 *   as pontas (ângulos paramétricos);
 * - polyline: vértices (movem) e pontos médios dos segmentos (movem o segmento inteiro);
 * - retângulo: cantos (o canto oposto fica fixo) e meios das arestas (movem a aresta), sem perder o tipo;
 * - texto: ponto de inserção (move);
 * - spline: pontos de ajuste ou vértices de controle (splineGrips.ts).
 * Inserir e remover vértices vale para polylines (vértices e pontos médios) e pontos de ajuste de splines.
 * Tudo é estrutural (sem depender do cad-core): os demais campos da entidade são preservados.
 */

export type GripShape = "square" | "circle" | "segment";

export type EntityGrip = Readonly<{
  id: string;
  point: Point2D;
  shape: GripShape;
}>;

type LineShape = Readonly<{ type: "line"; start: Point2D; end: Point2D }>;
type CircleShape = Readonly<{ type: "circle"; center: Point2D; radius: number }>;
type ArcShape = Readonly<{ type: "arc"; center: Point2D; radius: number; startAngle: number; endAngle: number; clockwise: boolean }>;
type EllipseShape = Readonly<{
  type: "ellipse";
  center: Point2D;
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}>;
type PolylineShape = Readonly<{ type: "polyline"; points: ReadonlyArray<Point2D>; closed: boolean }>;
type RectangleShape = Readonly<{ type: "rectangle"; x: number; y: number; width: number; height: number; rotation?: number }>;
type TextShape = Readonly<{ type: "text"; position: Point2D }>;
type SplineShape = Readonly<{
  type: "spline";
  controlPoints: ReadonlyArray<Point2D>;
  closed: boolean;
  fitPoints?: ReadonlyArray<Point2D> | undefined;
}>;

export type GripEntityShape = LineShape | CircleShape | ArcShape | EllipseShape | PolylineShape | RectangleShape | TextShape | SplineShape;

export type GripVertexOptions = Readonly<{ canAdd: boolean; canRemove: boolean }>;

const GRIP_TYPES: ReadonlySet<string> = new Set(["line", "circle", "arc", "ellipse", "polyline", "rectangle", "text", "spline"]);
const HALF_PI = Math.PI / 2;
const MIN_SIZE = 1e-9;

export function supportsEntityGrips(entity: Readonly<{ type: string }>): entity is GripEntityShape {
  return GRIP_TYPES.has(entity.type);
}

export function getEntityGripPoints(entity: GripEntityShape): ReadonlyArray<EntityGrip> {
  switch (entity.type) {
    case "line":
      return [
        square("start", entity.start),
        square("mid", midpoint(entity.start, entity.end)),
        square("end", entity.end)
      ];
    case "circle":
      return [square("center", entity.center), ...[0, 1, 2, 3].map((k) => square(`q${k}`, polar(entity.center, entity.radius, k * HALF_PI)))];
    case "arc": {
      const { start, mid, end } = arcKeyPoints(entity);
      return [square("center", entity.center), square("start", start), square("mid", mid), square("end", end)];
    }
    case "ellipse":
      return ellipseGrips(entity);
    case "polyline": {
      const vertices = entity.points.map((point, index) => square(`v:${index}`, point));
      const segments = segmentIndices(entity).map((index) => ({
        id: `m:${index}`,
        point: midpoint(entity.points[index]!, entity.points[(index + 1) % entity.points.length]!),
        shape: "segment" as const
      }));
      return [...vertices, ...segments];
    }
    case "rectangle": {
      const corners = getRectangleCorners(entity);
      return [
        ...corners.map((corner, index) => square(`c:${index}`, corner)),
        ...corners.map((corner, index) => ({ id: `e:${index}`, point: midpoint(corner, corners[(index + 1) % 4]!), shape: "segment" as const }))
      ];
    }
    case "text":
      return [square("insert", entity.position)];
    case "spline":
      return getSplineGripPoints(entity).map((grip) => ({
        id: grip.id,
        point: grip.point,
        shape: grip.kind === "control" && grip.index % 3 !== 0 ? "circle" as const : "square" as const
      }));
  }
}

/**
 * Entidade com o grip levado a point (mesmo tipo e demais campos); null quando o grip não existe ou a
 * geometria resultante é degenerada (o arrasto mantém o último estado válido).
 */
export function updateEntityByGrip<T extends GripEntityShape>(entity: T, gripId: string, point: Point2D): T | null {
  const shape = entity as GripEntityShape;
  const result = updateShape(shape, gripId, point);
  return result === null ? null : ({ ...entity, ...result } as T);
}

function updateShape(entity: GripEntityShape, gripId: string, point: Point2D): Partial<GripEntityShape> | null {
  switch (entity.type) {
    case "line": {
      if (gripId === "start") return { start: copy(point) };
      if (gripId === "end") return { end: copy(point) };
      if (gripId !== "mid") return null;
      const delta = subtract(point, midpoint(entity.start, entity.end));
      return { start: add(entity.start, delta), end: add(entity.end, delta) };
    }
    case "circle": {
      if (gripId === "center") return { center: copy(point) };
      if (!/^q[0-3]$/.test(gripId)) return null;
      const radius = distance(point, entity.center);
      return radius > MIN_SIZE ? { radius } : null;
    }
    case "arc":
      return updateArc(entity, gripId, point);
    case "ellipse":
      return updateEllipse(entity, gripId, point);
    case "polyline":
      return updatePolyline(entity, gripId, point);
    case "rectangle":
      return updateRectangle(entity, gripId, point);
    case "text":
      return gripId === "insert" ? { position: copy(point) } : null;
    case "spline": {
      const update = updateSplineByGrip(entity, gripId, point);
      return update === null ? null : { ...update };
    }
  }
}

export function gripVertexOptions(entity: GripEntityShape, gripId: string): GripVertexOptions {
  if (entity.type === "polyline") {
    const vertex = parseIndexedId(gripId, "v");
    if (vertex !== null && vertex < entity.points.length) {
      return { canAdd: true, canRemove: entity.points.length > (entity.closed ? 3 : 2) };
    }
    const segment = parseIndexedId(gripId, "m");
    return { canAdd: segment !== null && segmentIndices(entity).includes(segment), canRemove: false };
  }

  if (entity.type === "spline" && splineUsesFitGrips(entity)) {
    const fit = parseIndexedId(gripId, "fit");
    if (fit !== null && fit < entity.fitPoints!.length) {
      return { canAdd: true, canRemove: entity.fitPoints!.length > (entity.closed ? 3 : 2) };
    }
  }

  return { canAdd: false, canRemove: false };
}

/**
 * Insere um vértice logo após o grip (vértice da polyline, meio do segmento ou ponto de ajuste da spline)
 * na posição point; devolve a entidade e o id do grip do novo vértice, que passa a ser o grip ativo.
 */
export function addVertexAtGrip<T extends GripEntityShape>(entity: T, gripId: string, point: Point2D): Readonly<{ entity: T; gripId: string }> | null {
  const shape = entity as GripEntityShape;

  if (!gripVertexOptions(shape, gripId).canAdd) return null;

  if (shape.type === "polyline") {
    const index = parseIndexedId(gripId, "v") ?? parseIndexedId(gripId, "m")!;
    const points = [...shape.points.slice(0, index + 1), copy(point), ...shape.points.slice(index + 1)];
    return { entity: { ...entity, points } as T, gripId: `v:${index + 1}` };
  }

  const spline = shape as SplineShape;
  const index = parseIndexedId(gripId, "fit")!;
  const fitPoints = [...spline.fitPoints!.slice(0, index + 1), copy(point), ...spline.fitPoints!.slice(index + 1)];
  return {
    entity: { ...entity, fitPoints, controlPoints: fitPointsToBezierChain(fitPoints, spline.closed) } as T,
    gripId: `fit:${index + 1}`
  };
}

// Remove o vértice do grip (polyline ou ponto de ajuste), respeitando o mínimo de pontos.
export function removeVertexAtGrip<T extends GripEntityShape>(entity: T, gripId: string): T | null {
  const shape = entity as GripEntityShape;

  if (!gripVertexOptions(shape, gripId).canRemove) return null;

  if (shape.type === "polyline") {
    const index = parseIndexedId(gripId, "v")!;
    return { ...entity, points: shape.points.filter((_, i) => i !== index) } as T;
  }

  const spline = shape as SplineShape;
  const index = parseIndexedId(gripId, "fit")!;
  const fitPoints = spline.fitPoints!.filter((_, i) => i !== index);
  return { ...entity, fitPoints, controlPoints: fitPointsToBezierChain(fitPoints, spline.closed) } as T;
}

// ------------------------------------------------------------------------------------------------
// Arco
// ------------------------------------------------------------------------------------------------

function arcKeyPoints(arc: ArcShape): Readonly<{ start: Point2D; mid: Point2D; end: Point2D }> {
  const { curve, span } = curveOfEntity(arc);
  const range = span ?? { start: 0, sweep: Math.PI * 2 };
  const ends = spanEndpoints(curve, range);
  return { start: ends.start, mid: curvePointAt(curve, range.start + range.sweep / 2), end: ends.end };
}

function updateArc(arc: ArcShape, gripId: string, point: Point2D): Partial<ArcShape> | null {
  if (gripId === "center") return { center: copy(point) };

  const keys = arcKeyPoints(arc);
  const start = gripId === "start" ? point : keys.start;
  const mid = gripId === "mid" ? point : keys.mid;
  const end = gripId === "end" ? point : keys.end;

  if (gripId !== "start" && gripId !== "mid" && gripId !== "end") return null;

  const result = computeArcFromThreePoints(start, mid, end);

  if (!result.ok) return null;

  const { center, radius, startAngle, endAngle, clockwise } = result.arc;
  return { center, radius, startAngle, endAngle, clockwise };
}

// ------------------------------------------------------------------------------------------------
// Elipse
// ------------------------------------------------------------------------------------------------

function isEllipseArc(ellipse: EllipseShape): boolean {
  return ellipse.startAngle !== undefined && ellipse.endAngle !== undefined;
}

function ellipsePoint(ellipse: EllipseShape, param: number): Point2D {
  return ellipsePointAtParam(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, param);
}

function ellipseGrips(ellipse: EllipseShape): ReadonlyArray<EntityGrip> {
  const grips: EntityGrip[] = [square("center", ellipse.center)];
  const arc = isEllipseArc(ellipse);
  const sweep = arc ? normalizeEllipseSweep(ellipse.startAngle!, ellipse.endAngle!) : null;

  for (let k = 0; k < 4; k += 1) {
    // No arco de elipse, só os quadrantes que caem sobre o arco.
    if (sweep !== null && wrapAngle(k * HALF_PI - sweep.start) > sweep.sweep + 1e-9) continue;
    grips.push(square(`q${k}`, ellipsePoint(ellipse, k * HALF_PI)));
  }

  if (arc) {
    grips.push(square("start", ellipsePoint(ellipse, ellipse.startAngle!)), square("end", ellipsePoint(ellipse, ellipse.endAngle!)));
  }

  return grips;
}

function updateEllipse(ellipse: EllipseShape, gripId: string, point: Point2D): Partial<EllipseShape> | null {
  if (gripId === "center") return { center: copy(point) };

  const quadrant = /^q([0-3])$/.exec(gripId);

  if (quadrant !== null) {
    const radius = distance(point, ellipse.center);
    if (radius <= MIN_SIZE) return null;
    // Quadrantes 0 e 2 ficam no eixo local X; 1 e 3 no eixo local Y. Se o menor passar do maior, os eixos trocam.
    const resized = Number(quadrant[1]) % 2 === 0 ? { ...ellipse, radiusX: radius } : { ...ellipse, radiusY: radius };
    const normalized = normalizeEllipseAxes(resized);
    return {
      radiusX: normalized.radiusX,
      radiusY: normalized.radiusY,
      rotation: normalized.rotation,
      ...(isEllipseArc(normalized) ? { startAngle: normalized.startAngle, endAngle: normalized.endAngle } : {})
    };
  }

  if (!isEllipseArc(ellipse) || (gripId !== "start" && gripId !== "end")) return null;

  const param = ellipseParamAtPoint(ellipse.center, ellipse.radiusX, ellipse.radiusY, ellipse.rotation, point);
  const other = gripId === "start" ? ellipse.endAngle! : ellipse.startAngle!;

  if (Math.abs(wrapAngle(param - other)) <= 1e-9 || Math.abs(wrapAngle(param - other) - Math.PI * 2) <= 1e-9) return null;
  return gripId === "start" ? { startAngle: param } : { endAngle: param };
}

// ------------------------------------------------------------------------------------------------
// Polyline e retângulo
// ------------------------------------------------------------------------------------------------

function segmentIndices(polyline: PolylineShape): ReadonlyArray<number> {
  const count = polyline.points.length < 2 ? 0 : polyline.closed ? polyline.points.length : polyline.points.length - 1;
  return Array.from({ length: count }, (_, index) => index);
}

function updatePolyline(polyline: PolylineShape, gripId: string, point: Point2D): Partial<PolylineShape> | null {
  const vertex = parseIndexedId(gripId, "v");

  if (vertex !== null) {
    if (vertex >= polyline.points.length) return null;
    return { points: polyline.points.map((p, index) => (index === vertex ? copy(point) : p)) };
  }

  const segment = parseIndexedId(gripId, "m");

  if (segment === null || !segmentIndices(polyline).includes(segment)) return null;

  const next = (segment + 1) % polyline.points.length;
  const delta = subtract(point, midpoint(polyline.points[segment]!, polyline.points[next]!));
  return { points: polyline.points.map((p, index) => (index === segment || index === next ? add(p, delta) : p)) };
}

/**
 * Canto: o canto oposto fica fixo; meio da aresta: só a aresta se move. Tudo no referencial local do
 * retângulo (rotação em torno do canto base), que continua retângulo com a mesma rotação.
 */
function updateRectangle(rectangle: RectangleShape, gripId: string, point: Point2D): Partial<RectangleShape> | null {
  const rotation = rectangle.rotation ?? 0;
  const u = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const v = { x: -Math.sin(rotation), y: Math.cos(rotation) };
  const origin = { x: rectangle.x, y: rectangle.y };
  const local = { x: dot(subtract(point, origin), u), y: dot(subtract(point, origin), v) };
  let x0 = 0;
  let y0 = 0;
  let x1 = rectangle.width;
  let y1 = rectangle.height;
  const corner = parseIndexedId(gripId, "c");
  const edge = parseIndexedId(gripId, "e");

  if (corner !== null && corner < 4) {
    // Cantos locais na ordem de getRectangleCorners: (0,0), (w,0), (w,h), (0,h).
    if (corner === 0 || corner === 3) x0 = local.x;
    else x1 = local.x;
    if (corner === 0 || corner === 1) y0 = local.y;
    else y1 = local.y;
  } else if (edge !== null && edge < 4) {
    // Arestas: 0 = (0,0)-(w,0), 1 = (w,0)-(w,h), 2 = (w,h)-(0,h), 3 = (0,h)-(0,0).
    if (edge === 0) y0 = local.y;
    else if (edge === 1) x1 = local.x;
    else if (edge === 2) y1 = local.y;
    else x0 = local.x;
  } else {
    return null;
  }

  const minX = Math.min(x0, x1);
  const minY = Math.min(y0, y1);
  const width = Math.abs(x1 - x0);
  const height = Math.abs(y1 - y0);

  if (width <= MIN_SIZE || height <= MIN_SIZE) return null;

  return {
    x: origin.x + u.x * minX + v.x * minY,
    y: origin.y + u.y * minX + v.y * minY,
    width,
    height
  };
}

// ------------------------------------------------------------------------------------------------
// Utilitários
// ------------------------------------------------------------------------------------------------

function parseIndexedId(gripId: string, prefix: string): number | null {
  const match = new RegExp(`^${prefix}:(\\d+)$`).exec(gripId);
  return match === null ? null : Number(match[1]);
}

function square(id: string, point: Point2D): EntityGrip {
  return { id, point, shape: "square" };
}

function polar(center: Point2D, radius: number, angle: number): Point2D {
  return { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function subtract(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function copy(point: Point2D): Point2D {
  return { x: point.x, y: point.y };
}
