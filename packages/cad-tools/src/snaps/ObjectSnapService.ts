import {
  DEFAULT_SNAP_SETTINGS,
  findBestSnap,
  snapToleranceWorld,
  type Point2D,
  type SnapEntity,
  type SnapResult,
  type SnapSettings
} from "@cad-web/cad-geometry";
import { getDocumentSpatialIndex } from "@cad-web/cad-core";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolPointerEvent } from "../contracts/ToolEvent";
import type { SnapService } from "../contracts/ToolContext";

export class ObjectSnapService implements SnapService {
  constructor(private readonly settings: SnapSettings = DEFAULT_SNAP_SETTINGS) {}

  findSnap(event: ToolPointerEvent, context: ToolContext): SnapResult | null {
    if (!this.settings.enabled || this.settings.tolerancePx <= 0) {
      return findBestSnap(
        event.worldPoint,
        event.screenPoint,
        [],
        this.settings,
        context.viewport
      );
    }

    const tolerance = snapToleranceWorld(this.settings, context.viewport);
    const searchBox = {
      minX: event.worldPoint.x - tolerance,
      minY: event.worldPoint.y - tolerance,
      maxX: event.worldPoint.x + tolerance,
      maxY: event.worldPoint.y + tolerance
    };

    const spatialIndex = getDocumentSpatialIndex(context.document);
    let candidates = spatialIndex.query(searchBox);

    const invisibleLayerIds = new Set(
      context.document.layers.filter((l) => !l.visible).map((l) => l.id)
    );

    if (invisibleLayerIds.size > 0) {
      candidates = candidates.filter((e) => !invisibleLayerIds.has(e.layerId || "layer_0"));
    }

    return findBestSnap(
      event.worldPoint,
      event.screenPoint,
      candidates as ReadonlyArray<SnapEntity>,
      this.settings,
      context.viewport
    );
  }
}

export function resolveSnappedPoint(event: ToolPointerEvent, context: ToolContext): Point2D {
  return context.snapService.findSnap(event, context)?.point ?? event.worldPoint;
}
