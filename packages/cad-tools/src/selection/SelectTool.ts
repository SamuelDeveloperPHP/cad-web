import { UpdateEntityCommand, type DimensionEntity } from "@cad-web/cad-core";
import { getDimensionGripPoints, updateDimensionByGrip, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { findNearestEntityId } from "./hitTesting";

const DEFAULT_SCREEN_TOLERANCE_PIXELS = 8;
const DIMENSION_GRIP_TOLERANCE_PIXELS = 10;

type DimensionGripHit = Readonly<{
  entity: DimensionEntity;
  gripId: string;
  locked: boolean;
}>;

type DimensionGripDragState = Readonly<{
  originalEntity: DimensionEntity;
  gripId: string;
}>;

export class SelectTool implements CadTool {
  readonly id = "select";
  readonly name = "Select";
  readonly aliases = ["sel", "select"];

  private gripDrag: DimensionGripDragState | null = null;

  activate(context: ToolContext): void {
    context.showMessage("Select entity.");
  }

  deactivate(context: ToolContext): void {
    this.gripDrag = null;
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const gripHit = findDimensionGripHit(context, event);

    if (gripHit !== null) {
      if (gripHit.locked) {
        context.showMessage("[Grip] Layer is locked.");
        return TOOL_RESULT_NONE;
      }

      this.gripDrag = {
        originalEntity: gripHit.entity,
        gripId: gripHit.gripId
      };

      const preview = {
        type: "ghostEntities" as const,
        entities: [gripHit.entity]
      };

      context.setPreview(preview);
      context.showMessage("[Grip] Drag dimension grip. Release to update dimension. Press Esc to cancel.");

      return { type: "preview", preview };
    }

    const entityId = findNearestEntityId(context.document, {
      worldPoint: event.worldPoint,
      toleranceWorld: DEFAULT_SCREEN_TOLERANCE_PIXELS / context.viewport.scale
    });

    if (entityId === null) {
      context.clearSelection();
      return { type: "message", message: "Selection cleared." };
    }

    context.selectEntities([entityId]);

    return { type: "message", message: `Selected ${entityId}.` };
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.gripDrag !== null) {
      const updatedEntity = updateDimensionByGrip(
        this.gripDrag.originalEntity as any,
        this.gripDrag.gripId,
        resolveSnappedPoint(event, context)
      ) as DimensionEntity;
      const preview = {
        type: "ghostEntities" as const,
        entities: [updatedEntity]
      };

      context.setPreview(preview);

      return { type: "preview", preview };
    }

    return TOOL_RESULT_NONE;
  }

  onPointerUp(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.gripDrag !== null) {
      const updatedEntity = updateDimensionByGrip(
        this.gripDrag.originalEntity as any,
        this.gripDrag.gripId,
        resolveSnappedPoint(event, context)
      ) as DimensionEntity;

      context.executeCommand(new UpdateEntityCommand(updatedEntity.id, {
        definition: updatedEntity.definition
      } as Partial<DimensionEntity>));
      context.selectEntities([updatedEntity.id]);
      context.clearPreview();
      context.showMessage("[Grip] Dimension updated.");
      this.gripDrag = null;

      return { type: "complete" };
    }

    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      if (this.gripDrag !== null) {
        this.gripDrag = null;
        context.clearPreview();
        context.showMessage("[Grip] Edit canceled.");
        return { type: "cancel" };
      }

      context.clearSelection();
      return { type: "cancel" };
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(_input: string, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }
}

function findDimensionGripHit(context: ToolContext, event: ToolPointerEvent): DimensionGripHit | null {
  if (context.selection.entityIds.length !== 1) {
    return null;
  }

  const entity = context.document.entities.find((candidate) => candidate.id === context.selection.entityIds[0]);

  if (entity?.type !== "dimension") {
    return null;
  }

  const layer = context.document.layers.find((candidate) => candidate.id === entity.layerId);

  if (layer?.visible === false) {
    return null;
  }

  let nearestGripId: string | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const grip of getDimensionGripPoints(entity as any)) {
    const gripScreenPoint = worldToScreenPoint(grip.point, context.viewport);
    const gripDistance = distanceBetweenScreenPoints(event.screenPoint, gripScreenPoint);

    if (gripDistance <= DIMENSION_GRIP_TOLERANCE_PIXELS && gripDistance < nearestDistance) {
      nearestGripId = grip.id;
      nearestDistance = gripDistance;
    }
  }

  if (nearestGripId === null) {
    return null;
  }

  return {
    entity,
    gripId: nearestGripId,
    locked: layer?.locked === true
  };
}

function worldToScreenPoint(point: Point2D, viewport: ToolContext["viewport"]): Point2D {
  return {
    x: (point.x - viewport.origin.x) * viewport.scale,
    y: (point.y - viewport.origin.y) * viewport.scale
  };
}

function distanceBetweenScreenPoints(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
