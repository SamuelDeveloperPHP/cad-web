import type { EllipseEntity } from "@cad-web/cad-core";
import {
  ellipseArcFromPoints,
  ellipseFromAxisPoints,
  subtractPoints,
  type EllipseGeometry,
  type Point2D
} from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { parseDirectInput, resolveDirectInput } from "./directInput";

type EllipseArcPhase = "center" | "majorAxis" | "minorAxis" | "startAngle" | "endAngle";

/**
 * Ferramenta responsável por desenhar arcos de elipse. Primeiro define a elipse base
 * (centro, fim do eixo maior e semi-eixo menor) e depois os pontos que fixam os ângulos
 * inicial e final do arco. A varredura vai do início ao fim no sentido paramétrico crescente.
 */
export class EllipseArcTool implements CadTool {
  readonly id = "ellipseArc";
  readonly name = "Elliptical Arc";
  readonly aliases = ["ea", "ellipsearc", "arcoelipse"];

  private phase: EllipseArcPhase = "center";
  private center: Point2D | null = null;
  private majorAxisEnd: Point2D | null = null;
  private base: EllipseGeometry | null = null;
  private startPoint: Point2D | null = null;
  private cursorPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.reset();
    context.showMessage("Specify center of ELLIPSE ARC.");
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

    if (this.phase === "minorAxis") {
      const base = this.center !== null && this.majorAxisEnd !== null
        ? ellipseFromAxisPoints(this.center, this.majorAxisEnd, point)
        : null;

      if (base === null) {
        return { type: "error", message: "Ellipse axes must be greater than zero." };
      }

      this.base = base;
      this.phase = "startAngle";
      context.showMessage("Specify start angle of arc.");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "startAngle") {
      this.startPoint = point;
      this.phase = "endAngle";
      context.showMessage("Specify end angle of arc.");
      return TOOL_RESULT_NONE;
    }

    return this.confirmArc(point, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);
    this.cursorPoint = point;
    const geometry = this.buildGeometry(point);

    if (geometry === null) {
      return TOOL_RESULT_NONE;
    }

    const preview = {
      type: "ghostEntities" as const,
      entities: [this.toEntity(geometry, "preview_ellipse_arc", context.document.activeLayerId)]
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

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const parsed = parseDirectInput(input);

    if (parsed.kind === "empty" || parsed.kind === "invalid") {
      return parsed.kind === "invalid"
        ? { type: "error", message: "Invalid input. Use a number, x,y, @dx,dy, or @dist<angle." }
        : TOOL_RESULT_NONE;
    }

    if (this.phase === "center") {
      if (parsed.kind === "absolute") {
        this.center = parsed.point;
        this.phase = "majorAxis";
        context.showMessage("Specify end of major axis.");
        return TOOL_RESULT_NONE;
      }

      return { type: "error", message: "Specify center as x,y coordinates." };
    }

    const refPoint = this.getReferenceForPhase();

    if (refPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const cursorDir = this.cursorPoint !== null
      ? subtractPoints(this.cursorPoint, refPoint)
      : null;
    const point = resolveDirectInput(parsed, refPoint, cursorDir);

    if (point === null) {
      return { type: "error", message: "Move the cursor to indicate direction before entering distance." };
    }

    if (this.phase === "majorAxis") {
      this.majorAxisEnd = point;
      this.phase = "minorAxis";
      context.showMessage("Specify minor axis distance.");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "minorAxis") {
      const base = this.center !== null && this.majorAxisEnd !== null
        ? ellipseFromAxisPoints(this.center, this.majorAxisEnd, point)
        : null;

      if (base === null) {
        return { type: "error", message: "Ellipse axes must be greater than zero." };
      }

      this.base = base;
      this.phase = "startAngle";
      context.showMessage("Specify start angle of arc.");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "startAngle") {
      this.startPoint = point;
      this.phase = "endAngle";
      context.showMessage("Specify end angle of arc.");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "endAngle") {
      return this.confirmArc(point, context);
    }

    return TOOL_RESULT_NONE;
  }

  private getReferenceForPhase(): Point2D | null {
    if (this.phase === "majorAxis" || this.phase === "minorAxis") {
      return this.center;
    }

    if (this.phase === "startAngle" && this.base !== null) {
      return this.base.center;
    }

    if (this.phase === "endAngle" && this.base !== null) {
      return this.base.center;
    }

    return null;
  }

  // Constrói a geometria de preview conforme a fase atual, usando o ponto corrente do cursor.
  private buildGeometry(point: Point2D): EllipseGeometry | null {
    if (this.phase === "majorAxis" && this.center !== null) {
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

    if (this.phase === "startAngle" && this.base !== null) {
      // Antes de fixar o início, o preview mostra a elipse completa como referência.
      return this.base;
    }

    if (this.phase === "endAngle" && this.base !== null && this.startPoint !== null) {
      return ellipseArcFromPoints(this.base, this.startPoint, point);
    }

    return null;
  }

  private confirmArc(point: Point2D, context: ToolContext): ToolResult {
    if (this.base === null || this.startPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const geometry = ellipseArcFromPoints(this.base, this.startPoint, point);

    if (geometry === null) {
      return { type: "error", message: "Arc sweep must be greater than zero." };
    }

    const entity = this.toEntity(geometry, `ellipse_arc_${crypto.randomUUID()}`, context.document.activeLayerId);
    const command = createEntityCommand(entity);

    context.executeCommand(command);
    this.reset();
    context.clearPreview();
    context.showMessage("Specify center of ELLIPSE ARC.");

    return { type: "command", command };
  }

  private toEntity(geometry: EllipseGeometry, id: string, layerId: string): EllipseEntity {
    const entity: EllipseEntity = {
      id,
      layerId,
      type: "ellipse",
      center: geometry.center,
      radiusX: geometry.radiusX,
      radiusY: geometry.radiusY,
      rotation: geometry.rotation
    };

    if (geometry.startAngle !== undefined && geometry.endAngle !== undefined) {
      return { ...entity, startAngle: geometry.startAngle, endAngle: geometry.endAngle };
    }

    return entity;
  }

  private reset(): void {
    this.phase = "center";
    this.center = null;
    this.majorAxisEnd = null;
    this.base = null;
    this.startPoint = null;
    this.cursorPoint = null;
  }
}
