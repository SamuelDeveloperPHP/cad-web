import { getDocumentSpatialIndex, resolveDimensionStyle, type CadDocument, type DimensionEntity, type EntityId } from "@cad-web/cad-core";
import {
  buildAlignedDimensionGeometry,
  buildAngularDimensionGeometry,
  buildDiameterDimensionGeometry,
  buildLinearDimensionGeometry,
  buildRadiusDimensionGeometry,
  distance,
  distancePointToSegment,
  rotationMatrix,
  transformPoint,
  type Point2D
} from "@cad-web/cad-geometry";

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
  let candidates = spatialIndex.query(searchBox);

  const invisibleLayerIds = new Set(
    document.layers.filter((l) => !l.visible).map((l) => l.id)
  );

  if (invisibleLayerIds.size > 0) {
    candidates = candidates.filter((e) => !invisibleLayerIds.has(e.layerId || "layer_0"));
  }

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
    } else if (entity.type === "dimension") {
      candidateDistance = distancePointToDimension(options.worldPoint, entity, document);
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

function distancePointToDimension(point: Point2D, entity: DimensionEntity, document: CadDocument): number {
  const style = resolveDimensionStyle(document, entity);
  let geom: any;

  if (entity.dimensionType === "linear") {
    geom = buildLinearDimensionGeometry(entity.definition as any, style, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "aligned") {
    geom = buildAlignedDimensionGeometry(entity.definition as any, style, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "radius") {
    geom = buildRadiusDimensionGeometry(entity.definition as any, style, document.units, document.displayUnit || document.units);
  } else if (entity.dimensionType === "diameter") {
    geom = buildDiameterDimensionGeometry(entity.definition as any, style, document.units, document.displayUnit || document.units);
  } else {
    geom = buildAngularDimensionGeometry(entity.definition as any, style);
  }

  let nearestDistance = Number.POSITIVE_INFINITY;

  if (geom.extensionLine1) {
    nearestDistance = Math.min(nearestDistance, distancePointToSegment(point, geom.extensionLine1.start, geom.extensionLine1.end));
  }

  if (geom.extensionLine2) {
    nearestDistance = Math.min(nearestDistance, distancePointToSegment(point, geom.extensionLine2.start, geom.extensionLine2.end));
  }

  if (geom.dimensionLine) {
    nearestDistance = Math.min(nearestDistance, distancePointToSegment(point, geom.dimensionLine.start, geom.dimensionLine.end));
  }

  if (geom.leaderLine) {
    nearestDistance = Math.min(nearestDistance, distancePointToSegment(point, geom.leaderLine.start, geom.leaderLine.end));
  }

  if (entity.dimensionType === "angular") {
    nearestDistance = Math.min(nearestDistance, distancePointToAngularArc(point, geom));
  }

  return nearestDistance;
}

function distancePointToAngularArc(point: Point2D, geom: any): number {
  const angle = normalizeAngle(Math.atan2(point.y - geom.arcCenter.y, point.x - geom.arcCenter.x));
  const startAngle = normalizeAngle(geom.startAngle);
  const sweep = normalizeAngle(geom.endAngle - geom.startAngle);
  const angleFromStart = normalizeAngle(angle - startAngle);

  if (angleFromStart > sweep) {
    return Math.min(distance(point, geom.arcStart), distance(point, geom.arcEnd));
  }

  return Math.abs(distance(point, geom.arcCenter) - geom.radius);
}

function normalizeAngle(angle: number): number {
  return (angle + Math.PI * 2) % (Math.PI * 2);
}
