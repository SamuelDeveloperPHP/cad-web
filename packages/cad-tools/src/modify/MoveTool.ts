import type { CadEntity } from "@cad-web/cad-core";
import { addVector, pointsNearlyEqual, subtractPoints, type Point2D } from "@cad-web/cad-geometry";
import { moveEntitiesCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";

export class MoveTool implements CadTool {
  readonly id = "move";
  readonly name = "Move";
  readonly aliases = ["m", "move"];

  private basePoint: Point2D | null = null;
  private currentPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.basePoint = null;
    this.currentPoint = null;

    if (context.selection.entityIds.length === 0) {
      context.showMessage("Select entities before MOVE.");
      return;
    }

    context.showMessage("Specify base point.");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (context.selection.entityIds.length === 0) {
      return { type: "error", message: "Move requires selected entities." };
    }

    const point = context.snapService.findSnap(event.worldPoint, context)?.point ?? event.worldPoint;

    if (this.basePoint === null) {
      this.basePoint = point;
      this.currentPoint = point;
      context.showMessage("Specify destination point.");
      return TOOL_RESULT_NONE;
    }

    return this.confirmMove(point, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.basePoint === null || context.selection.entityIds.length === 0) {
      return TOOL_RESULT_NONE;
    }

    const point = context.snapService.findSnap(event.worldPoint, context)?.point ?? event.worldPoint;
    this.currentPoint = point;
    const displacement = subtractPoints(point, this.basePoint);
    const preview = {
      type: "ghostEntities" as const,
      entities: getSelectedEntities(context).map((entity) => moveEntity(entity, displacement))
    };

    // A ferramenta entrega entidades fantasmas; o renderer decide como desenhar o preview.
    context.setPreview(preview);

    return { type: "preview", preview };
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.reset(context);
      return { type: "cancel" };
    }

    if (event.key === "Enter" && this.basePoint !== null && this.currentPoint !== null) {
      return this.confirmMove(this.currentPoint, context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (input.trim().length === 0 && this.basePoint !== null && this.currentPoint !== null) {
      return this.confirmMove(this.currentPoint, context);
    }

    return TOOL_RESULT_NONE;
  }

  private confirmMove(destinationPoint: Point2D, context: ToolContext): ToolResult {
    if (this.basePoint === null) {
      return TOOL_RESULT_NONE;
    }

    if (pointsNearlyEqual(this.basePoint, destinationPoint)) {
      return { type: "error", message: "Move requires a non-zero displacement." };
    }

    const displacement = subtractPoints(destinationPoint, this.basePoint);
    const command = moveEntitiesCommand(context.selection.entityIds, displacement);
    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private reset(context: ToolContext): void {
    this.basePoint = null;
    this.currentPoint = null;
    context.clearPreview();
  }
}

function getSelectedEntities(context: ToolContext): ReadonlyArray<CadEntity> {
  const selectedIds = new Set(context.selection.entityIds);

  return context.document.entities.filter((entity) => selectedIds.has(entity.id));
}

function moveEntity(entity: CadEntity, displacement: Point2D): CadEntity {
  if (entity.type === "line") {
    return {
      ...entity,
      start: addVector(entity.start, displacement),
      end: addVector(entity.end, displacement)
    };
  }

  return entity;
}
