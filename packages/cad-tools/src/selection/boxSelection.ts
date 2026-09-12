import { entityBoundingBox, type CadDocument, type EntityId } from "@cad-web/cad-core";
import { boundingBoxesIntersect, type BoundingBox, type Point2D } from "@cad-web/cad-geometry";

export type BoxSelectionMode = "window" | "crossing";

/**
 * A função devolve o modo da caixa a partir da direção do arrasto: da esquerda para a direita
 * seleciona por janela (contido), da direita para a esquerda por cruzamento (interseção).
 */
export function boxSelectionMode(start: Point2D, end: Point2D): BoxSelectionMode {
  return end.x >= start.x ? "window" : "crossing";
}

export function boxSelectionBounds(a: Point2D, b: Point2D): BoundingBox {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y)
  };
}

/**
 * A função retorna os ids das entidades apanhadas pela caixa. No modo janela a entidade precisa
 * estar totalmente contida; no modo cruzamento basta o retângulo envolvente cruzar a caixa.
 * Entidades em camadas invisíveis são ignoradas.
 */
export function entitiesInSelectionBox(
  document: CadDocument,
  cornerA: Point2D,
  cornerB: Point2D,
  mode: BoxSelectionMode
): EntityId[] {
  const bounds = boxSelectionBounds(cornerA, cornerB);
  const invisibleLayerIds = new Set(
    document.layers.filter((layer) => !layer.visible).map((layer) => layer.id)
  );
  const result: EntityId[] = [];

  for (const entity of document.entities) {
    if (invisibleLayerIds.has(entity.layerId || "layer_0")) {
      continue;
    }

    const bbox = entityBoundingBox(entity);
    const hit =
      mode === "window"
        ? bbox.minX >= bounds.minX && bbox.maxX <= bounds.maxX && bbox.minY >= bounds.minY && bbox.maxY <= bounds.maxY
        : boundingBoxesIntersect(bbox, bounds);

    if (hit) {
      result.push(entity.id);
    }
  }

  return result;
}
