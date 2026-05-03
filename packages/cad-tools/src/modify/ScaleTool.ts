import { scaleEntity, type CadEntity } from "@cad-web/cad-core";
import { CAD_EPSILON, distance, type Point2D } from "@cad-web/cad-geometry";
import { scaleEntitiesCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

export class ScaleTool implements CadTool {
  readonly id = "scale";
  readonly name = "Scale";
  readonly aliases = ["sc", "scale"];

  private basePoint: Point2D | null = null;
  private currentPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.basePoint = null;
    this.currentPoint = null;

    if (context.selection.entityIds.length === 0) {
      context.showMessage("Select entities before SCALE.");
      return;
    }

    context.showMessage("Specify base point for SCALE.");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (context.selection.entityIds.length === 0) {
      return { type: "error", message: "Scale requires selected entities." };
    }

    const point = resolveSnappedPoint(event, context);

    if (this.basePoint === null) {
      this.basePoint = point;
      this.currentPoint = point;
      context.showMessage("Specify scale factor or click distance point.");
      return TOOL_RESULT_NONE;
    }

    return this.confirmScale(this.getVisualFactor(point), context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.basePoint === null || context.selection.entityIds.length === 0) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);
    this.currentPoint = point;
    const factor = this.getVisualFactor(point);

    if (factor <= CAD_EPSILON) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: getSelectedEntities(context).map((entity) => scaleEntity(entity, this.basePoint!, factor))
    };

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

    if (event.key === "Enter" && this.currentPoint !== null) {
      return this.confirmScale(this.getVisualFactor(this.currentPoint), context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const text = input.trim();

    if (this.basePoint === null || text.length === 0) {
      return TOOL_RESULT_NONE;
    }

    const factor = Number(text);

    if (!Number.isFinite(factor) || factor <= 0) {
      return { type: "error", message: "Scale factor must be greater than zero." };
    }

    return this.confirmScale(factor, context);
  }

  private confirmScale(factor: number, context: ToolContext): ToolResult {
    if (this.basePoint === null) {
      return TOOL_RESULT_NONE;
    }

    if (!Number.isFinite(factor) || factor <= CAD_EPSILON) {
      return { type: "error", message: "Scale factor must be greater than zero." };
    }

    const command = scaleEntitiesCommand(context.selection.entityIds, this.basePoint, factor);
    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private getVisualFactor(point: Point2D): number {
    if (this.basePoint === null) {
      return 0;
    }

    return distance(this.basePoint, point);
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
