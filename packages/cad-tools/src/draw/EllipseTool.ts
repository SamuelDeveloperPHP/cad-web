import type { EllipseEntity } from "@cad-web/cad-core";
import { ellipseFromAxisPoints, type EllipseGeometry, type Point2D } from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

type EllipsePhase = "center" | "majorAxis" | "minorAxis";

/**
 * Ferramenta responsável por desenhar elipses no modo centro:
 * primeiro o centro, depois o fim do eixo maior (define rotação e semi-eixo maior)
 * e por fim um ponto que define o semi-eixo menor (distância perpendicular ao eixo maior).
 */
export class EllipseTool implements CadTool {
  readonly id = "ellipse";
  readonly name = "Ellipse";
  readonly aliases = ["el", "ellipse", "elipse"];

  private phase: EllipsePhase = "center";
  private center: Point2D | null = null;
  private majorAxisEnd: Point2D | null = null;

  activate(context: ToolContext): void {
    this.reset();
    context.showMessage("Specify center of ELLIPSE.");
  }

  deactivate(context: ToolContext): void {
    this.reset();
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.phase === "center") {
      this.center = point;
      this.phase = "majorAxis";
      context.showMessage("Specify end of major axis.");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "majorAxis") {
      this.majorAxisEnd = point;
      this.phase = "minorAxis";
      context.showMessage("Specify minor axis distance.");
      return TOOL_RESULT_NONE;
    }

    return this.confirmEllipse(point, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);
    const geometry = this.buildGeometry(point);

    if (geometry === null) {
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: [this.toEntity(geometry, "preview_ellipse", context.document.activeLayerId)]
    };

    context.setPreview(preview);
    return { type: "preview", preview };
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.reset();
      context.clearPreview();
      return { type: "cancel" };
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(_input: string, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  // Constrói a geometria de preview conforme a fase atual, usando o ponto corrente do cursor.
  private buildGeometry(point: Point2D): EllipseGeometry | null {
    if (this.phase === "majorAxis" && this.center !== null) {
      // Durante a definição do eixo maior o preview mostra um círculo (semi-eixos iguais).
      const radius = Math.hypot(point.x - this.center.x, point.y - this.center.y);

      if (radius <= 0) {
        return null;
      }

      return ellipseFromAxisPoints(this.center, point, {
        x: this.center.x - (point.y - this.center.y),
        y: this.center.y + (point.x - this.center.x)
      });
    }

    if (this.phase === "minorAxis" && this.center !== null && this.majorAxisEnd !== null) {
      return ellipseFromAxisPoints(this.center, this.majorAxisEnd, point);
    }

    return null;
  }

  private confirmEllipse(point: Point2D, context: ToolContext): ToolResult {
    if (this.center === null || this.majorAxisEnd === null) {
      return TOOL_RESULT_NONE;
    }

    const geometry = ellipseFromAxisPoints(this.center, this.majorAxisEnd, point);

    if (geometry === null) {
      return { type: "error", message: "Ellipse axes must be greater than zero." };
    }

    const entity = this.toEntity(geometry, `ellipse_${crypto.randomUUID()}`, context.document.activeLayerId);
    const command = createEntityCommand(entity);

    context.executeCommand(command);
    this.reset();
    context.clearPreview();
    context.showMessage("Specify center of ELLIPSE.");

    return { type: "command", command };
  }

  private toEntity(geometry: EllipseGeometry, id: string, layerId: string): EllipseEntity {
    return {
      id,
      layerId,
      type: "ellipse",
      center: geometry.center,
      radiusX: geometry.radiusX,
      radiusY: geometry.radiusY,
      rotation: geometry.rotation
    };
  }

  private reset(): void {
    this.phase = "center";
    this.center = null;
    this.majorAxisEnd = null;
  }
}
