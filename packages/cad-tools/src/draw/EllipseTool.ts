import type { EllipseEntity } from "@cad-web/cad-core";
import { ellipseFromAxisPoints, subtractPoints, type EllipseGeometry, type Point2D } from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { parseDirectInput, resolveDirectInput } from "./directInput";

type EllipsePhase = "center" | "axisStart" | "axisEnd" | "majorAxis" | "minorAxis";

/**
 * Ferramenta responsável por desenhar elipses em dois modos, como no AutoCAD:
 * - Centro (padrão): centro → fim do primeiro eixo → distância até o outro eixo.
 * - Eixo, Fim (opção `a`): dois extremos do primeiro eixo → distância até o outro eixo.
 * O eixo maior é sempre guardado no eixo X local (a geometria é normalizada no kernel).
 */
export class EllipseTool implements CadTool {
  readonly id = "ellipse";
  readonly name = "Ellipse";
  readonly aliases = ["el", "ellipse", "elipse"];

  private phase: EllipsePhase = "center";
  private center: Point2D | null = null;
  private majorAxisEnd: Point2D | null = null;
  private axisStart: Point2D | null = null;
  private cursorPoint: Point2D | null = null;

  claimsCommandInput(input: string): boolean {
    const option = input.trim().toLowerCase();
    return (this.phase === "center" || this.phase === "axisStart") && ELLIPSE_OPTIONS.has(option);
  }

  activate(context: ToolContext): void {
    this.reset();
    context.showMessage(CENTER_PROMPT);
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

    if (this.phase === "axisStart") {
      this.axisStart = point;
      this.phase = "axisEnd";
      context.showMessage("Specify other endpoint of axis.");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "axisEnd") {
      return this.acceptAxisEnd(point, context);
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
    this.cursorPoint = point;
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

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const option = input.trim().toLowerCase();

    // Opções de modo, aceitas antes do primeiro ponto: a/axis/eixo = Eixo, Fim; c/center/centro = Centro.
    if ((this.phase === "center" || this.phase === "axisStart") && ["a", "axis", "eixo"].includes(option)) {
      this.phase = "axisStart";
      context.showMessage(AXIS_PROMPT);
      return TOOL_RESULT_NONE;
    }

    if ((this.phase === "center" || this.phase === "axisStart") && ["c", "center", "centro"].includes(option)) {
      this.phase = "center";
      context.showMessage(CENTER_PROMPT);
      return TOOL_RESULT_NONE;
    }

    const parsed = parseDirectInput(input);

    if (parsed.kind === "empty" || parsed.kind === "invalid") {
      return parsed.kind === "invalid"
        ? { type: "error", message: "Invalid input. Use a number, x,y, @dx,dy, or @dist<angle." }
        : TOOL_RESULT_NONE;
    }

    if (this.phase === "center") {
      if (parsed.kind === "absolute") {
        this.center = { x: parsed.point.x * context.unitScale, y: parsed.point.y * context.unitScale };
        this.phase = "majorAxis";
        context.showMessage("Specify end of major axis.");
        return TOOL_RESULT_NONE;
      }

      return { type: "error", message: "Specify center as x,y coordinates." };
    }

    if (this.phase === "axisStart") {
      if (parsed.kind === "absolute") {
        this.axisStart = { x: parsed.point.x * context.unitScale, y: parsed.point.y * context.unitScale };
        this.phase = "axisEnd";
        context.showMessage("Specify other endpoint of axis.");
        return TOOL_RESULT_NONE;
      }

      return { type: "error", message: "Specify axis endpoint as x,y coordinates." };
    }

    if (this.phase === "axisEnd" && this.axisStart !== null) {
      // Distância, relativo ou polar a partir do primeiro extremo: o comprimento é o eixo inteiro.
      const cursorDir = this.cursorPoint !== null ? subtractPoints(this.cursorPoint, this.axisStart) : null;
      const point = resolveDirectInput(parsed, this.axisStart, cursorDir, context.unitScale);

      if (point === null) {
        return { type: "error", message: "Move the cursor to indicate direction before entering distance." };
      }

      return this.acceptAxisEnd(point, context);
    }

    if (this.phase === "majorAxis" && this.center !== null) {
      const cursorDir = this.cursorPoint !== null
        ? subtractPoints(this.cursorPoint, this.center)
        : null;
      const point = resolveDirectInput(parsed, this.center, cursorDir, context.unitScale);

      if (point === null) {
        return { type: "error", message: "Move the cursor to indicate direction before entering distance." };
      }

      this.majorAxisEnd = point;
      this.phase = "minorAxis";
      context.showMessage("Specify minor axis distance.");
      return TOOL_RESULT_NONE;
    }

    if (this.phase === "minorAxis" && this.center !== null && this.majorAxisEnd !== null) {
      // Distância ou polar digitados definem o semi-eixo menor exato, perpendicular ao eixo maior,
      // sem depender do ângulo do cursor (o valor digitado é aplicado na íntegra).
      const typedDistance = parsed.kind === "distance"
        ? parsed.value
        : parsed.kind === "polar"
          ? parsed.distance
          : null;

      if (typedDistance !== null) {
        const minorPoint = perpendicularMinorPoint(this.center, this.majorAxisEnd, typedDistance * context.unitScale);
        return this.confirmEllipse(minorPoint, context);
      }

      const cursorDir = this.cursorPoint !== null
        ? subtractPoints(this.cursorPoint, this.center)
        : null;
      const point = resolveDirectInput(parsed, this.center, cursorDir, context.unitScale);

      if (point === null) {
        return { type: "error", message: "Move the cursor to indicate direction before entering distance." };
      }

      return this.confirmEllipse(point, context);
    }

    return TOOL_RESULT_NONE;
  }

  // Constrói a geometria de preview conforme a fase atual, usando o ponto corrente do cursor.
  private buildGeometry(point: Point2D): EllipseGeometry | null {
    if (this.phase === "axisEnd" && this.axisStart !== null) {
      // Com os dois extremos, o preview é o círculo cujo diâmetro é o eixo.
      const center = { x: (this.axisStart.x + point.x) / 2, y: (this.axisStart.y + point.y) / 2 };
      return ellipseFromAxisPoints(center, point, { x: center.x - (point.y - center.y), y: center.y + (point.x - center.x) });
    }

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
    context.showMessage(CENTER_PROMPT);

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

  getSnapReferencePoint(): Point2D | null {
    if (this.phase === "axisEnd") {
      return this.axisStart;
    }

    if (this.phase === "majorAxis" || this.phase === "minorAxis") {
      return this.center;
    }

    return null;
  }

  // O segundo extremo fecha o eixo: o centro é o ponto médio e o extremo vira o fim do eixo.
  private acceptAxisEnd(point: Point2D, context: ToolContext): ToolResult {
    if (this.axisStart === null) {
      return TOOL_RESULT_NONE;
    }

    if (Math.hypot(point.x - this.axisStart.x, point.y - this.axisStart.y) <= 0) {
      return { type: "error", message: "Axis endpoints must be different." };
    }

    this.center = { x: (this.axisStart.x + point.x) / 2, y: (this.axisStart.y + point.y) / 2 };
    this.majorAxisEnd = point;
    this.phase = "minorAxis";
    context.showMessage("Specify distance to other axis.");
    return TOOL_RESULT_NONE;
  }

  private reset(): void {
    this.phase = "center";
    this.center = null;
    this.majorAxisEnd = null;
    this.axisStart = null;
    this.cursorPoint = null;
  }
}

const ELLIPSE_OPTIONS: ReadonlySet<string> = new Set(["a", "axis", "eixo", "c", "center", "centro"]);
const CENTER_PROMPT = "[Ellipse] Specify center or [a = Axis, End]";
const AXIS_PROMPT = "[Ellipse] Specify axis endpoint or [c = Center]";

// A função devolve um ponto na direção perpendicular ao eixo maior, à distância exata informada,
// de modo que o semi-eixo menor resultante seja igual ao valor digitado.
export function perpendicularMinorPoint(center: Point2D, majorAxisEnd: Point2D, distance: number): Point2D {
  const rotation = Math.atan2(majorAxisEnd.y - center.y, majorAxisEnd.x - center.x);
  const perpX = -Math.sin(rotation);
  const perpY = Math.cos(rotation);

  return {
    x: center.x + perpX * distance,
    y: center.y + perpY * distance
  };
}
