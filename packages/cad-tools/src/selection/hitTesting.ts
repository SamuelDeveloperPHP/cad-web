import type { CadDocument, EntityId } from "@cad-web/cad-core";
import { distancePointToSegment, type Point2D } from "@cad-web/cad-geometry";

export type HitTestOptions = Readonly<{
  worldPoint: Point2D;
  toleranceWorld: number;
}>;

export function findNearestEntityId(document: CadDocument, options: HitTestOptions): EntityId | null {
  let nearestId: EntityId | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of document.entities) {
    if (entity.type !== "line") {
      continue;
    }

    const candidateDistance = distancePointToSegment(options.worldPoint, entity.start, entity.end);

    if (candidateDistance <= options.toleranceWorld && candidateDistance < nearestDistance) {
      nearestId = entity.id;
      nearestDistance = candidateDistance;
    }
  }

  return nearestId;
}
