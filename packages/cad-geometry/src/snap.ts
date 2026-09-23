import { CAD_EPSILON } from "./constants";
import { projectPointOnSegment } from "./distance";
import { rotationMatrix, transformPoint } from "./matrix";
import type { Point2D } from "./types";
import { distance, midpoint, normalize, subtractPoints } from "./vector";
import { arcEndPoint, arcPointAtAngle, arcStartPoint, arcSweepAngle, nearestPointOnArc } from "./arc";
import {
  ellipseArcEndpoints,
  ellipseArcMidpoint,
  ellipseQuadrantPoints,
  nearestPointOnEllipse,
  type EllipseGeometry
} from "./ellipse";
import { intersectPrimitives, type IntersectPrimitive } from "./intersections";
import { perpendicularPointsOnPrimitive, tangentPointsOnPrimitive } from "./perpTangent";

export type SnapType =
  | "endpoint"
  | "insertion"
  | "midpoint"
  | "center"
  | "quadrant"
  | "intersection"
  | "perpendicular"
  | "tangent"
  | "nearest";

export type SnapSettings = Readonly<{
  enabled: boolean;
  endpoint: boolean;
  insertion: boolean;
  midpoint: boolean;
  center: boolean;
  quadrant: boolean;
  intersection: boolean;
  perpendicular: boolean;
  tangent: boolean;
  nearest: boolean;
  tolerancePx: number;
}>;

export type SnapCandidate = Readonly<{
  type: SnapType;
  point: Point2D;
  entityId: string;
  distancePx: number;
  priority: number;
}>;

export type SnapResult = Readonly<{
  snapped: boolean;
  point: Point2D;
  rawPoint: Point2D;
  candidate?: SnapCandidate;
}>;

export type SnapViewport = Readonly<{
  origin: Point2D;
  scale: number;
}>;

export type SnapLineEntity = Readonly<{
  id: string;
  type: "line";
  start: Point2D;
  end: Point2D;
}>;

export type SnapRectangleEntity = Readonly<{
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
}>;

export type SnapCircleEntity = Readonly<{
  id: string;
  type: "circle";
  center: Point2D;
  radius: number;
}>;

export type SnapArcEntity = Readonly<{
  id: string;
  type: "arc";
  center: Point2D;
  radius: number;
  startAngle: number;
  endAngle: number;
  clockwise: boolean;
}>;

export type SnapPolylineEntity = Readonly<{
  id: string;
  type: "polyline";
  points: ReadonlyArray<Point2D>;
  closed: boolean;
}>;

export type SnapEllipseEntity = Readonly<{
  id: string;
  type: "ellipse";
  center: Point2D;
  radiusX: number;
  radiusY: number;
  rotation: number;
  startAngle?: number | undefined;
  endAngle?: number | undefined;
}>;

// O texto expõe apenas o ponto de inserção (snap Insertion do AutoCAD).
export type SnapTextEntity = Readonly<{
  id: string;
  type: "text";
  position: Point2D;
}>;

export type SnapEntity =
  | SnapTextEntity
  | SnapLineEntity
  | SnapRectangleEntity
  | SnapCircleEntity
  | SnapArcEntity
  | SnapEllipseEntity
  | SnapPolylineEntity;

export const DEFAULT_SNAP_SETTINGS: SnapSettings = {
  enabled: true,
  endpoint: true,
  insertion: true,
  midpoint: true,
  center: true,
  quadrant: true,
  intersection: true,
  perpendicular: true,
  tangent: true,
  nearest: true,
  tolerancePx: 12
};

const SNAP_PRIORITY: Record<SnapType, number> = {
  endpoint: 8,
  insertion: 8,
  intersection: 7,
  midpoint: 6,
  perpendicular: 5,
  tangent: 4,
  quadrant: 3,
  center: 2,
  nearest: 1
};

// Converte uma SnapEllipseEntity para a geometria pura usada pelas funções de elipse.
function toEllipseGeometry(entity: SnapEllipseEntity): EllipseGeometry {
  return {
    type: "ellipse",
    center: entity.center,
    radiusX: entity.radiusX,
    radiusY: entity.radiusY,
    rotation: entity.rotation,
    startAngle: entity.startAngle,
    endAngle: entity.endAngle
  };
}

/**
 * Reduz uma entidade de snap às primitivas usadas pelo cálculo de interseção: segmentos para
 * linhas/retângulos/polylines; círculo (com faixa opcional) para círculos e arcos; elipse para
 * elipses e arcos de elipse.
 */
export function entityIntersectPrimitives(entity: SnapEntity): ReadonlyArray<IntersectPrimitive> {
  return snapEntityToPrimitives(entity);
}

function snapEntityToPrimitives(entity: SnapEntity): ReadonlyArray<IntersectPrimitive> {
  if (entity.type === "line") {
    return [{ kind: "segment", a: entity.start, b: entity.end }];
  }

  if (entity.type === "rectangle") {
    const corners = getRectangleCorners(entity);
    return [
      { kind: "segment", a: corners[0], b: corners[1] },
      { kind: "segment", a: corners[1], b: corners[2] },
      { kind: "segment", a: corners[2], b: corners[3] },
      { kind: "segment", a: corners[3], b: corners[0] }
    ];
  }

  if (entity.type === "polyline") {
    return polylineEntitySegments(entity).map(([a, b]) => ({ kind: "segment", a, b }));
  }

  if (entity.type === "circle") {
    return [{ kind: "circle", center: entity.center, radius: entity.radius }];
  }

  if (entity.type === "arc") {
    return [{
      kind: "circle",
      center: entity.center,
      radius: entity.radius,
      arc: { startAngle: entity.startAngle, endAngle: entity.endAngle, clockwise: entity.clockwise }
    }];
  }

  if (entity.type === "ellipse") {
    return [{ kind: "ellipse", ellipse: toEllipseGeometry(entity) }];
  }

  // Tipos sem primitiva de interseção/perp/tangente (ex.: cotas, que chegam via cast em runtime) não geram candidatos.
  return [];
}

export function getIntersectionSnapCandidates(
  entityA: SnapEntity,
  entityB: SnapEntity,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  const primitivesA = snapEntityToPrimitives(entityA);
  const primitivesB = snapEntityToPrimitives(entityB);
  const candidates: SnapCandidate[] = [];

  for (const primitiveA of primitivesA) {
    for (const primitiveB of primitivesB) {
      for (const point of intersectPrimitives(primitiveA, primitiveB)) {
        // O id combina as duas entidades cruzadas, já que a interseção não pertence a uma só.
        candidates.push(createSnapCandidate("intersection", point, `${entityA.id}×${entityB.id}`, screenPoint, viewport));
      }
    }
  }

  return candidates;
}

export function getPerpendicularSnapCandidates(
  entity: SnapEntity,
  referencePoint: Point2D,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  return snapEntityToPrimitives(entity).flatMap((primitive) =>
    perpendicularPointsOnPrimitive(primitive, referencePoint).map((point) =>
      createSnapCandidate("perpendicular", point, entity.id, screenPoint, viewport)
    )
  );
}

export function getTangentSnapCandidates(
  entity: SnapEntity,
  referencePoint: Point2D,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  return snapEntityToPrimitives(entity).flatMap((primitive) =>
    tangentPointsOnPrimitive(primitive, referencePoint).map((point) =>
      createSnapCandidate("tangent", point, entity.id, screenPoint, viewport)
    )
  );
}

export function getEndpointSnapCandidates(
  entity: SnapEntity,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  if (entity.type === "line") {
    return [
      createSnapCandidate("endpoint", entity.start, entity.id, screenPoint, viewport),
      createSnapCandidate("endpoint", entity.end, entity.id, screenPoint, viewport)
    ];
  }

  if (entity.type === "rectangle") {
    return getRectangleCorners(entity).map((point) =>
      createSnapCandidate("endpoint", point, entity.id, screenPoint, viewport)
    );
  }

  if (entity.type === "arc") {
    return [
      createSnapCandidate("endpoint", arcStartPoint(entity), entity.id, screenPoint, viewport),
      createSnapCandidate("endpoint", arcEndPoint(entity), entity.id, screenPoint, viewport)
    ];
  }

  if (entity.type === "ellipse") {
    // Só o arco de elipse tem extremidades; a elipse fechada não expõe endpoint.
    return ellipseArcEndpoints(toEllipseGeometry(entity)).map((point) =>
      createSnapCandidate("endpoint", point, entity.id, screenPoint, viewport)
    );
  }

  if (entity.type === "polyline") {
    // O snap endpoint expoe todos os vertices da polyline, independentemente de closed.
    return entity.points.map((point) =>
      createSnapCandidate("endpoint", point, entity.id, screenPoint, viewport)
    );
  }

  return [];
}

// O ponto de inserção do texto é o seu único ponto de snap (snap Insertion).
export function getInsertionSnapCandidates(
  entity: SnapEntity,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  if (entity.type === "text") {
    return [createSnapCandidate("insertion", entity.position, entity.id, screenPoint, viewport)];
  }

  return [];
}

export function getMidpointSnapCandidates(
  entity: SnapEntity,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  if (entity.type === "line") {
    return [createSnapCandidate("midpoint", midpoint(entity.start, entity.end), entity.id, screenPoint, viewport)];
  }

  if (entity.type === "rectangle") {
    return getRectangleSegments(entity).map(([start, end]) =>
      createSnapCandidate("midpoint", midpoint(start, end), entity.id, screenPoint, viewport)
    );
  }

  if (entity.type === "arc") {
    const sweep = arcSweepAngle(entity.startAngle, entity.endAngle, entity.clockwise);
    const midpointAngle = entity.clockwise
      ? entity.startAngle + sweep / 2
      : entity.startAngle - sweep / 2;

    return [createSnapCandidate("midpoint", arcPointAtAngle(entity.center, entity.radius, midpointAngle), entity.id, screenPoint, viewport)];
  }

  if (entity.type === "ellipse") {
    // Só o arco de elipse expõe midpoint (metade da varredura).
    const arcMidpoint = ellipseArcMidpoint(toEllipseGeometry(entity));
    return arcMidpoint === null
      ? []
      : [createSnapCandidate("midpoint", arcMidpoint, entity.id, screenPoint, viewport)];
  }

  if (entity.type === "polyline") {
    // O snap midpoint expoe o ponto medio de cada segmento, incluindo o fechamento quando closed.
    return polylineEntitySegments(entity).map(([start, end]) =>
      createSnapCandidate("midpoint", midpoint(start, end), entity.id, screenPoint, viewport)
    );
  }

  return [];
}

export function getQuadrantSnapCandidates(
  entity: SnapEntity,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  if (entity.type === "ellipse") {
    // Os quadrantes são os extremos dos semi-eixos; num arco, só os que caem na varredura.
    return ellipseQuadrantPoints(toEllipseGeometry(entity)).map((point) =>
      createSnapCandidate("quadrant", point, entity.id, screenPoint, viewport)
    );
  }

  if (entity.type === "circle") {
    // O círculo expõe os quatro quadrantes (extremos horizontais e verticais).
    return [
      { x: entity.center.x + entity.radius, y: entity.center.y },
      { x: entity.center.x, y: entity.center.y + entity.radius },
      { x: entity.center.x - entity.radius, y: entity.center.y },
      { x: entity.center.x, y: entity.center.y - entity.radius }
    ].map((point) => createSnapCandidate("quadrant", point, entity.id, screenPoint, viewport));
  }

  return [];
}

export function getCenterSnapCandidates(
  entity: SnapEntity,
  screenPoint: Point2D,
  viewport: SnapViewport
): ReadonlyArray<SnapCandidate> {
  if (entity.type === "circle") {
    return [createSnapCandidate("center", entity.center, entity.id, screenPoint, viewport)];
  }

  if (entity.type === "rectangle") {
    const corners = getRectangleCorners(entity);
    return [createSnapCandidate("center", midpoint(corners[0], corners[2]), entity.id, screenPoint, viewport)];
  }

  if (entity.type === "arc") {
    return [createSnapCandidate("center", entity.center, entity.id, screenPoint, viewport)];
  }

  if (entity.type === "ellipse") {
    return [createSnapCandidate("center", entity.center, entity.id, screenPoint, viewport)];
  }

  return [];
}

export function getNearestSnapCandidate(
  entity: SnapEntity,
  rawPoint: Point2D,
  screenPoint: Point2D,
  viewport: SnapViewport
): SnapCandidate | null {
  if (entity.type === "line") {
    const projection = projectPointOnSegment(rawPoint, entity.start, entity.end);
    return createSnapCandidate("nearest", projection.point, entity.id, screenPoint, viewport);
  }

  if (entity.type === "rectangle") {
    return chooseClosestCandidate(
      getRectangleSegments(entity).map(([start, end]) => {
        const projection = projectPointOnSegment(rawPoint, start, end);
        return createSnapCandidate("nearest", projection.point, entity.id, screenPoint, viewport);
      })
    );
  }

  if (entity.type === "circle") {
    const vectorFromCenter = subtractPoints(rawPoint, entity.center);
    const direction = normalize(vectorFromCenter);
    const safeDirection = distance(direction, { x: 0, y: 0 }) <= CAD_EPSILON ? { x: 1, y: 0 } : direction;
    const point = {
      x: entity.center.x + safeDirection.x * entity.radius,
      y: entity.center.y + safeDirection.y * entity.radius
    };

    return createSnapCandidate("nearest", point, entity.id, screenPoint, viewport);
  }

  if (entity.type === "arc") {
    return createSnapCandidate("nearest", nearestPointOnArc(rawPoint, entity), entity.id, screenPoint, viewport);
  }

  if (entity.type === "ellipse") {
    return createSnapCandidate("nearest", nearestPointOnEllipse(rawPoint, toEllipseGeometry(entity)), entity.id, screenPoint, viewport);
  }

  if (entity.type === "polyline") {
    // O snap nearest projeta o ponto em cada segmento e mantem o melhor candidato.
    const segments = polylineEntitySegments(entity);
    if (segments.length === 0) {
      return null;
    }

    return chooseClosestCandidate(
      segments.map(([start, end]) => {
        const projection = projectPointOnSegment(rawPoint, start, end);
        return createSnapCandidate("nearest", projection.point, entity.id, screenPoint, viewport);
      })
    );
  }

  return null;
}

function polylineEntitySegments(entity: SnapPolylineEntity): Array<[Point2D, Point2D]> {
  // O metodo monta os pares start/end dos segmentos, incluindo o fechamento quando closed.
  const segments: Array<[Point2D, Point2D]> = [];

  for (let index = 0; index < entity.points.length - 1; index += 1) {
    const start = entity.points[index];
    const end = entity.points[index + 1];

    if (start && end) {
      segments.push([start, end]);
    }
  }

  if (entity.closed && entity.points.length >= 3) {
    const last = entity.points[entity.points.length - 1];
    const first = entity.points[0];

    if (last && first) {
      segments.push([last, first]);
    }
  }

  return segments;
}

export function findBestSnap(
  rawPoint: Point2D,
  screenPoint: Point2D,
  entities: ReadonlyArray<SnapEntity>,
  settings: SnapSettings,
  viewport: SnapViewport,
  // Ponto de referência (o ponto anterior do desenho em andamento); habilita perpendicular e tangente.
  referencePoint?: Point2D
): SnapResult {
  if (!settings.enabled || settings.tolerancePx <= 0) {
    return createUnsnappedResult(rawPoint);
  }

  const candidates: SnapCandidate[] = [];

  for (const entity of entities) {
    if (settings.endpoint) {
      candidates.push(...getEndpointSnapCandidates(entity, screenPoint, viewport));
    }

    if (settings.insertion) {
      candidates.push(...getInsertionSnapCandidates(entity, screenPoint, viewport));
    }

    if (settings.midpoint) {
      candidates.push(...getMidpointSnapCandidates(entity, screenPoint, viewport));
    }

    if (settings.center) {
      candidates.push(...getCenterSnapCandidates(entity, screenPoint, viewport));
    }

    if (settings.quadrant) {
      candidates.push(...getQuadrantSnapCandidates(entity, screenPoint, viewport));
    }

    if (settings.perpendicular && referencePoint !== undefined) {
      candidates.push(...getPerpendicularSnapCandidates(entity, referencePoint, screenPoint, viewport));
    }

    if (settings.tangent && referencePoint !== undefined) {
      candidates.push(...getTangentSnapCandidates(entity, referencePoint, screenPoint, viewport));
    }

    if (settings.nearest) {
      const nearestCandidate = getNearestSnapCandidate(entity, rawPoint, screenPoint, viewport);

      if (nearestCandidate !== null) {
        candidates.push(nearestCandidate);
      }
    }
  }

  if (settings.intersection) {
    // A interseção é um snap entre pares de entidades; percorre cada par uma única vez.
    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        const entityA = entities[i];
        const entityB = entities[j];

        if (entityA !== undefined && entityB !== undefined) {
          candidates.push(...getIntersectionSnapCandidates(entityA, entityB, screenPoint, viewport));
        }
      }
    }
  }

  const viableCandidates = candidates
    .filter((candidate) => candidate.distancePx <= settings.tolerancePx)
    .sort((left, right) => right.priority - left.priority || left.distancePx - right.distancePx);

  const candidate = viableCandidates[0];

  if (candidate === undefined) {
    return createUnsnappedResult(rawPoint);
  }

  return {
    snapped: true,
    point: candidate.point,
    rawPoint,
    candidate
  };
}

export function snapToleranceWorld(settings: SnapSettings, viewport: SnapViewport): number {
  return settings.tolerancePx / viewport.scale;
}

export function snapWorldToScreen(point: Point2D, viewport: SnapViewport): Point2D {
  return {
    x: (point.x - viewport.origin.x) * viewport.scale,
    y: (point.y - viewport.origin.y) * viewport.scale
  };
}

function createSnapCandidate(
  type: SnapType,
  point: Point2D,
  entityId: string,
  screenPoint: Point2D,
  viewport: SnapViewport
): SnapCandidate {
  return {
    type,
    point,
    entityId,
    distancePx: distance(screenPoint, snapWorldToScreen(point, viewport)),
    priority: SNAP_PRIORITY[type]
  };
}

function createUnsnappedResult(rawPoint: Point2D): SnapResult {
  return {
    snapped: false,
    point: rawPoint,
    rawPoint
  };
}

function getRectangleCorners(entity: SnapRectangleEntity): Readonly<[Point2D, Point2D, Point2D, Point2D]> {
  const origin = { x: entity.x, y: entity.y };
  const corners: [Point2D, Point2D, Point2D, Point2D] = [
    origin,
    { x: entity.x + entity.width, y: entity.y },
    { x: entity.x + entity.width, y: entity.y + entity.height },
    { x: entity.x, y: entity.y + entity.height }
  ];

  if (entity.rotation === undefined || Math.abs(entity.rotation) <= CAD_EPSILON) {
    return corners;
  }

  const matrix = rotationMatrix(entity.rotation, origin);

  return corners.map((point) => transformPoint(point, matrix)) as [Point2D, Point2D, Point2D, Point2D];
}

function getRectangleSegments(entity: SnapRectangleEntity): ReadonlyArray<Readonly<[Point2D, Point2D]>> {
  const corners = getRectangleCorners(entity);

  return [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]]
  ];
}

function chooseClosestCandidate(candidates: ReadonlyArray<SnapCandidate>): SnapCandidate | null {
  let closestCandidate: SnapCandidate | null = null;

  for (const candidate of candidates) {
    if (closestCandidate === null || candidate.distancePx < closestCandidate.distancePx) {
      closestCandidate = candidate;
    }
  }

  return closestCandidate;
}
