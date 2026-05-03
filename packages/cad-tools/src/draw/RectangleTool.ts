import type { Point2D } from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

/**
 * Ferramenta responsável por desenhar retângulos.
 */
export class RectangleTool implements CadTool {
  readonly id = "rectangle";
  readonly name = "Rectangle";
  readonly aliases = ["rec", "rect", "rectangle"];

  private startPoint: Point2D | null = null;
  private currentPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.startPoint = null;
    this.currentPoint = null;
    context.showMessage("Specify first corner point for RECTANGLE.");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.startPoint === null) {
      this.startPoint = point;
      this.currentPoint = point;
      context.showMessage("Specify other corner point or enter dimensions (e.g. 100,50).");
      return TOOL_RESULT_NONE;
    }

    return this.confirmRectangle(point, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);
    this.currentPoint = point;

    if (this.startPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: [this.createRectangleEntity(this.startPoint, this.currentPoint, "preview_rect")]
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
    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (this.startPoint !== null) {
      const dimensions = this.parseDimensions(input);
      
      if (dimensions) {
        const targetPoint: Point2D = {
          x: this.startPoint.x + dimensions.width,
          y: this.startPoint.y + dimensions.height
        };
        return this.confirmRectangle(targetPoint, context);
      } else if (input.trim() !== "") {
        return { type: "error", message: "Invalid dimensions. Use format '100,50', '100x50' or 'w=100 h=50'." };
      }
    }
    return TOOL_RESULT_NONE;
  }

  private confirmRectangle(endPoint: Point2D, context: ToolContext): ToolResult {
    if (this.startPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const entity = this.createRectangleEntity(this.startPoint, endPoint, `rect_${crypto.randomUUID()}`);
    const command = createEntityCommand(entity);
    
    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private createRectangleEntity(start: Point2D, end: Point2D, id: string) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);

    return {
      id,
      layerId: "default",
      type: "rectangle" as const,
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      rotation: 0
    };
  }

  private parseDimensions(input: string): { width: number; height: number } | null {
    const text = input.trim().toLowerCase();
    
    // Formato: w=100 h=50, width=100 height=50, comprimento=100 altura=50
    const keyValueRegex = /(?:w|width|comprimento)\s*=\s*([+-]?\d*\.?\d+)\s*(?:h|height|altura)\s*=\s*([+-]?\d*\.?\d+)/;
    const kvMatch = text.match(keyValueRegex);
    if (kvMatch && kvMatch[1] && kvMatch[2]) {
      return { width: parseFloat(kvMatch[1]), height: parseFloat(kvMatch[2]) };
    }

    // Formato: 100,50 ou 100x50
    const separatorRegex = /^([+-]?\d*\.?\d+)\s*[,xX]\s*([+-]?\d*\.?\d+)$/;
    const sepMatch = text.match(separatorRegex);
    if (sepMatch && sepMatch[1] && sepMatch[2]) {
      return { width: parseFloat(sepMatch[1]), height: parseFloat(sepMatch[2]) };
    }

    return null;
  }

  private reset(context: ToolContext): void {
    this.startPoint = null;
    this.currentPoint = null;
    context.clearPreview();
    context.showMessage("Specify first corner point for RECTANGLE.");
  }
}
