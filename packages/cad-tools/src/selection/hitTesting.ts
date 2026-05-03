import { getDocumentSpatialIndex, type CadDocument, type EntityId } from "@cad-web/cad-core";
import { distance, distancePointToSegment, rotationMatrix, transformPoint, type Point2D } from "@cad-web/cad-geometry";

export type HitTestOptions = Readonly<{
  worldPoint: Point2D;
  toleranceWorld: number;
}>;

export function findNearestEntityId(document: CadDocument, options: HitTestOptions): EntityId | null {
  let nearestId: EntityId | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  const searchBox = {
    minX: options.worldPoint.x - options.toleranceWorld,
    minY: options.worldPoint.y - options.toleranceWorld,
    maxX: options.worldPoint.x + options.toleranceWorld,
    maxY: options.worldPoint.y + options.toleranceWorld
  };

  const spatialIndex = getDocumentSpatialIndex(document);
  const candidates = spatialIndex.query(searchBox);

  for (const entity of candidates) {
    let candidateDistance = Number.POSITIVE_INFINITY;

    if (entity.type === "line") {
      candidateDistance = distancePointToSegment(options.worldPoint, entity.start, entity.end);
    } else if (entity.type === "rectangle") {
      let p1: Point2D = { x: entity.x, y: entity.y };
      let p2: Point2D = { x: entity.x + entity.width, y: entity.y };
      let p3: Point2D = { x: entity.x + entity.width, y: entity.y + entity.height };
      let p4: Point2D = { x: entity.x, y: entity.y + entity.height };

      if (entity.rotation) {
        const matrix = rotationMatrix(entity.rotation, p1);
        p1 = transformPoint(p1, matrix);
        p2 = transformPoint(p2, matrix);
        p3 = transformPoint(p3, matrix);
        p4 = transformPoint(p4, matrix);
      }

      candidateDistance = Math.min(
        distancePointToSegment(options.worldPoint, p1, p2),
        distancePointToSegment(options.worldPoint, p2, p3),
        distancePointToSegment(options.worldPoint, p3, p4),
        distancePointToSegment(options.worldPoint, p4, p1)
      );
    } else if (entity.type === "circle") {
      const distToCenter = distance(options.worldPoint, entity.center);
      candidateDistance = Math.abs(distToCenter - entity.radius);
    } else {
      continue;
    }

    if (candidateDistance <= options.toleranceWorld && candidateDistance < nearestDistance) {
      nearestId = entity.id;
      nearestDistance = candidateDistance;
    }
  }

  return nearestId;
}
