import type { LineEntity } from "@cad-web/cad-core";
import { pointsNearlyEqual, type Point2D } from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

export class LineTool implements CadTool {
  readonly id = "line";
  readonly name = "Line";
  readonly aliases = ["l", "line"];

  private startPoint: Point2D | null = null;
  private currentPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.startPoint = null;
    this.currentPoint = null;
    context.showMessage("Specify first point.");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const snappedPoint = resolveSnappedPoint(event, context);

    if (this.startPoint === null) {
      this.startPoint = snappedPoint;
      this.currentPoint = snappedPoint;
      context.showMessage("Specify next point.");

      return TOOL_RESULT_NONE;
    }

    if (pointsNearlyEqual(this.startPoint, snappedPoint)) {
      return { type: "error", message: "Line requires two distinct points." };
    }

    const entity = createLineEntity(this.startPoint, snappedPoint);
    const command = createEntityCommand(entity);
    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.startPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const snappedPoint = resolveSnappedPoint(event, context);
    this.currentPoint = snappedPoint;
    const preview = {
      type: "rubberBand" as const,
      from: this.startPoint,
      to: snappedPoint
    };

    // A ferramenta publica apenas dados de preview; o renderer decide como desenhar.
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

    if (event.key === "Enter" && this.startPoint !== null && this.currentPoint !== null) {
      return this.confirmCurrentLine(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (input.trim().length === 0 && this.startPoint !== null && this.currentPoint !== null) {
      return this.confirmCurrentLine(context);
    }

    return TOOL_RESULT_NONE;
  }

  private confirmCurrentLine(context: ToolContext): ToolResult {
    if (this.startPoint === null || this.currentPoint === null) {
      return TOOL_RESULT_NONE;
    }

    if (pointsNearlyEqual(this.startPoint, this.currentPoint)) {
      return { type: "error", message: "Line requires two distinct points." };
    }

    const entity = createLineEntity(this.startPoint, this.currentPoint);
    const command = createEntityCommand(entity);
    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private reset(context: ToolContext): void {
    this.startPoint = null;
    this.currentPoint = null;
    context.clearPreview();
  }
}

function createLineEntity(start: Point2D, end: Point2D): LineEntity {
  return {
    id: `line_${crypto.randomUUID()}`,
    layerId: "default",
    type: "line",
    start,
    end
  };
}
