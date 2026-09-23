import {
  getDocumentSpatialIndex,
  type ArcEntity,
  type CadEntity,
  type CircleEntity,
  type EllipseEntity,
  type LineEntity
} from "@cad-web/cad-core";
import {
  distance,
  distancePointToArc,
  distancePointToEllipse,
  distancePointToSegment,
  entityIntersectPrimitives,
  type BoundaryPrimitive,
  type BoundingBox,
  type Point2D,
  type SnapEntity
} from "@cad-web/cad-geometry";
import type { ToolContext } from "../contracts/ToolContext";

/**
 * Utilitários compartilhados por Trim e Extend: localizar o objeto editável sob o cursor e reduzir
 * as arestas de corte/limite a primitivas de interseção (qualquer tipo com geometria: linha, retângulo,
 * polyline, círculo, arco, elipse e arco de elipse).
 */

export type CurveEntity = CircleEntity | ArcEntity | EllipseEntity;
export type EditableEntity = LineEntity | CurveEntity;

export type EditableHit = Readonly<{ entity: EditableEntity; locked: boolean; distance: number }>;

export function isCurveEntity(entity: CadEntity): entity is CurveEntity {
  return entity.type === "circle" || entity.type === "arc" || entity.type === "ellipse";
}

// Distância do ponto à entidade editável (a mesma usada pela seleção).
export function distanceToEditable(point: Point2D, entity: EditableEntity): number {
  if (entity.type === "line") return distancePointToSegment(point, entity.start, entity.end);
  if (entity.type === "circle") return Math.abs(distance(point, entity.center) - entity.radius);
  if (entity.type === "arc") return distancePointToArc(point, entity);
  return distancePointToEllipse(point, { ...entity, type: "ellipse" });
}

export function findNearestEditable(
  context: ToolContext,
  point: Point2D,
  toleranceWorld: number,
  accept: (entity: CadEntity) => entity is EditableEntity
): EditableHit | null {
  const candidates = getDocumentSpatialIndex(context.document).query({
    minX: point.x - toleranceWorld,
    minY: point.y - toleranceWorld,
    maxX: point.x + toleranceWorld,
    maxY: point.y + toleranceWorld
  });
  let nearest: EditableHit | null = null;

  for (const entity of candidates) {
    if (!accept(entity) || !isLayerVisible(context, entity)) {
      continue;
    }

    const entityDistance = distanceToEditable(point, entity);

    if (entityDistance <= toleranceWorld && (nearest === null || entityDistance < nearest.distance)) {
      nearest = { entity, locked: isLayerLocked(context, entity), distance: entityDistance };
    }
  }

  return nearest;
}

// Tipos que podem servir de aresta de corte ou de limite.
export function hasIntersectGeometry(entity: CadEntity): boolean {
  return ["line", "rectangle", "polyline", "circle", "arc", "ellipse"].includes(entity.type);
}

export function toBoundaryPrimitives(entities: ReadonlyArray<CadEntity>): ReadonlyArray<BoundaryPrimitive> {
  return entities.flatMap((entity) =>
    entityIntersectPrimitives(entity as unknown as SnapEntity).map((primitive) => ({ primitive, entityId: entity.id }))
  );
}

/**
 * Arestas de corte/limite utilizáveis: as escolhidas pelo usuário ou, no modo "todas", as visíveis e
 * desbloqueadas dentro da caixa de busca (consulta ao índice espacial). A entidade alvo nunca corta a si mesma.
 */
export function collectBoundaryEntities(
  context: ToolContext,
  selectedIds: ReadonlySet<string>,
  useAllVisible: boolean,
  searchBox: BoundingBox,
  targetId: string
): ReadonlyArray<CadEntity> {
  const candidates = useAllVisible
    ? getDocumentSpatialIndex(context.document).query(searchBox)
    : context.document.entities.filter((entity) => selectedIds.has(entity.id));

  return candidates.filter((entity) => entity.id !== targetId && hasIntersectGeometry(entity) && isEntityLayerUsable(context, entity));
}

export function padBox(box: BoundingBox, padding: number): BoundingBox {
  return { minX: box.minX - padding, minY: box.minY - padding, maxX: box.maxX + padding, maxY: box.maxY + padding };
}

export function isEntityLayerUsable(context: ToolContext, entity: CadEntity): boolean {
  return isLayerVisible(context, entity) && !isLayerLocked(context, entity);
}

export function isLayerVisible(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));
  return layer?.visible !== false;
}

export function isLayerLocked(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((candidate) => candidate.id === (entity.layerId || "layer_0"));
  return layer?.locked === true;
}

export function newPieceId(originalId: string, suffix: string): string {
  const unique = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  return `${originalId}_${suffix}_${unique}`;
}
