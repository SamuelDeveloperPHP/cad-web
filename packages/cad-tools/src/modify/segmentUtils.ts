import {
  getDocumentSpatialIndex,
  type CadEntity,
  type LineEntity,
  type PolylineEntity,
  type RectangleEntity
} from "@cad-web/cad-core";
import {
  distancePointToSegment,
  explodeRectangleToLines,
  pointsToSegments,
  type Point2D,
  type SegmentGeometry
} from "@cad-web/cad-geometry";
import type { ToolContext } from "../contracts/ToolContext";

export type SegmentSource =
  | Readonly<{ kind: "line"; entity: LineEntity }>
  | Readonly<{
      kind: "edge";
      entity: RectangleEntity | PolylineEntity;
      edgeIndex: number;
      segment: SegmentGeometry;
    }>;

export type SegmentHit = SegmentSource & Readonly<{ locked: boolean }>;

export function findNearestSegment(
  context: ToolContext,
  point: Point2D,
  toleranceWorld: number,
  excludedEntityId?: string
): SegmentHit | null {
  const candidates = getDocumentSpatialIndex(context.document).query({
    minX: point.x - toleranceWorld,
    minY: point.y - toleranceWorld,
    maxX: point.x + toleranceWorld,
    maxY: point.y + toleranceWorld
  });
  let nearestHit: SegmentHit | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const entity of candidates) {
    if (entity.id === excludedEntityId || !isLayerVisible(context, entity)) {
      continue;
    }

    const locked = isLayerLocked(context, entity);
    const segments = extractSegments(entity);

    if (segments === null) {
      continue;
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const dist = distancePointToSegment(point, seg.start, seg.end);

      if (dist <= toleranceWorld && dist < nearestDistance) {
        nearestDistance = dist;

        if (entity.type === "line") {
          nearestHit = { kind: "line", entity, locked };
        } else {
          nearestHit = {
            kind: "edge",
            entity: entity as RectangleEntity | PolylineEntity,
            edgeIndex: i,
            segment: seg,
            locked
          };
        }
      }
    }
  }

  return nearestHit;
}

export function extractSegments(entity: CadEntity): ReadonlyArray<SegmentGeometry> | null {
  if (entity.type === "line") {
    return [{ type: "segment", start: entity.start, end: entity.end }];
  }

  if (entity.type === "rectangle") {
    return explodeRectangleToLines(entity);
  }

  if (entity.type === "polyline") {
    return pointsToSegments(entity.points, entity.closed);
  }

  return null;
}

export function areEdgesAdjacent(
  entity: RectangleEntity | PolylineEntity,
  edgeIndex1: number,
  edgeIndex2: number
): { cornerIndex: number; seg1Index: number; seg2Index: number } | null {
  const segments = extractSegments(entity);

  if (segments === null || segments.length < 2) {
    return null;
  }

  const edgeCount = segments.length;
  const isClosed = entity.type === "rectangle" || (entity.type === "polyline" && entity.closed);
  const lo = Math.min(edgeIndex1, edgeIndex2);
  const hi = Math.max(edgeIndex1, edgeIndex2);

  if (hi - lo === 1) {
    return { cornerIndex: hi, seg1Index: lo, seg2Index: hi };
  }

  if (isClosed && lo === 0 && hi === edgeCount - 1) {
    return { cornerIndex: 0, seg1Index: hi, seg2Index: lo };
  }

  return null;
}

function isLayerVisible(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((l) => l.id === (entity.layerId || "layer_0"));

  return layer?.visible !== false;
}

function isLayerLocked(context: ToolContext, entity: CadEntity): boolean {
  const layer = context.document.layers.find((l) => l.id === (entity.layerId || "layer_0"));

  return layer?.locked === true;
}
