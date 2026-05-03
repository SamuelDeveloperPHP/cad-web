import type { Point2D } from "@cad-web/cad-geometry";
import { distance } from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

/**
 * Ferramenta responsável por desenhar círculos.
 */
export class CircleTool implements CadTool {
  readonly id = "circle";
  readonly name = "Circle";
  readonly aliases = ["c", "circle"];

  private centerPoint: Point2D | null = null;
  private currentPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.centerPoint = null;
    this.currentPoint = null;
    context.showMessage("Specify center point for CIRCLE.");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.centerPoint === null) {
      this.centerPoint = point;
      this.currentPoint = point;
      context.showMessage("Specify radius of circle or enter diameter (e.g. d=100, r=50, 50).");
      return TOOL_RESULT_NONE;
    }

    const radius = distance(this.centerPoint, point);
    return this.confirmCircle(radius, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);
    this.currentPoint = point;

    if (this.centerPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const radius = distance(this.centerPoint, point);

    if (radius <= 0) {
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: [this.createCircleEntity(this.centerPoint, radius, "preview_circle")]
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
    if (this.centerPoint !== null) {
      const radius = this.parseRadius(input);
      
      if (radius !== null && radius > 0) {
        return this.confirmCircle(radius, context);
      } else if (input.trim() !== "") {
        return { type: "error", message: "Invalid input. Use format '50', 'r=50', or 'd=100'." };
      }
    }
    return TOOL_RESULT_NONE;
  }

  private confirmCircle(radius: number, context: ToolContext): ToolResult {
    if (this.centerPoint === null || radius <= 0) {
      return { type: "error", message: "Radius must be greater than zero." };
    }

    const entity = this.createCircleEntity(this.centerPoint, radius, `circle_${crypto.randomUUID()}`);
    const command = createEntityCommand(entity);
    
    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private createCircleEntity(center: Point2D, radius: number, id: string) {
    return {
      id,
      layerId: "default",
      type: "circle" as const,
      center,
      radius
    };
  }

  private parseRadius(input: string): number | null {
    const text = input.trim().toLowerCase();
    
    // Formato numérico simples: 50 -> Raio
    const num = parseFloat(text);
    if (!isNaN(num) && num.toString() === text) {
      return num;
    }

    // Formatos explícitos: r=50, raio=50, radius=50
    const radiusRegex = /^(?:r|raio|radius)\s*=\s*([+-]?\d*\.?\d+)$/;
    const rMatch = text.match(radiusRegex);
    if (rMatch && rMatch[1]) {
      return parseFloat(rMatch[1]);
    }

    // Formatos explícitos de diâmetro: d=100, diametro=100, diameter=100 -> Raio = d/2
    const diameterRegex = /^(?:d|diametro|diameter)\s*=\s*([+-]?\d*\.?\d+)$/;
    const dMatch = text.match(diameterRegex);
    if (dMatch && dMatch[1]) {
      return parseFloat(dMatch[1]) / 2;
    }

    return null;
  }

  private reset(context: ToolContext): void {
    this.centerPoint = null;
    this.currentPoint = null;
    context.clearPreview();
    context.showMessage("Specify center point for CIRCLE.");
  }
}
