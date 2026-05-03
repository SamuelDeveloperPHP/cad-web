import {
  DEFAULT_SNAP_SETTINGS,
  findBestSnap,
  type Point2D,
  type SnapEntity,
  type SnapResult,
  type SnapSettings
} from "@cad-web/cad-geometry";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolPointerEvent } from "../contracts/ToolEvent";
import type { SnapService } from "../contracts/ToolContext";

export class ObjectSnapService implements SnapService {
  constructor(private readonly settings: SnapSettings = DEFAULT_SNAP_SETTINGS) {}

  findSnap(event: ToolPointerEvent, context: ToolContext): SnapResult | null {
    return findBestSnap(
      event.worldPoint,
      event.screenPoint,
      context.document.entities as ReadonlyArray<SnapEntity>,
      this.settings,
      context.viewport
    );
  }
}

export function resolveSnappedPoint(event: ToolPointerEvent, context: ToolContext): Point2D {
  return context.snapService.findSnap(event, context)?.point ?? event.worldPoint;
}
