import type { SplineEntity } from "@cad-web/cad-core";
import { fitPointsToBezierChain, pointsNearlyEqual, subtractPoints, type Point2D } from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import { parseDirectInput, resolveDirectInput } from "./directInput";

const CLOSE_OPTIONS = ["c", "close", "fechar"];
const UNDO_OPTIONS = ["u", "undo", "desfazer"];

/**
 * Ferramenta Spline (SPLINE do AutoCAD, método por pontos de ajuste): a curva cúbica C2 passa por
 * todos os pontos clicados ou digitados. Enter conclui aberta, `c` fecha (spline periódica, sem quina),
 * `u` desfaz o último ponto. Os pontos digitados seguem a entrada direta (x,y, @dx,dy, @d<a, distância)
 * na unidade de trabalho.
 */
export class SplineTool implements CadTool {
  readonly id = "spline";
  readonly name = "Spline";
  readonly aliases = ["spl", "spline"];

  private points: Point2D[] = [];
  private cursorPoint: Point2D | null = null;

  // Durante o desenho, c/u são opções da Spline, não os aliases de Circle/Undo.
  claimsCommandInput(input: string): boolean {
    const option = input.trim().toLowerCase();
    return this.points.length > 0 && (CLOSE_OPTIONS.includes(option) || UNDO_OPTIONS.includes(option));
  }

  getSnapReferencePoint(): Point2D | null {
    return this.points[this.points.length - 1] ?? null;
  }

  activate(context: ToolContext): void {
    this.reset(context);
  }

  deactivate(context: ToolContext): void {
    this.points = [];
    this.cursorPoint = null;
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    return this.addPoint(resolveSnappedPoint(event, context, undefined, this.getSnapReferencePoint() ?? undefined), context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.points.length === 0) {
      return TOOL_RESULT_NONE;
    }

    this.cursorPoint = resolveSnappedPoint(event, context, undefined, this.getSnapReferencePoint() ?? undefined);
    return this.refreshPreview(context);
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.reset(context);
      return { type: "cancel" };
    }

    if (event.key === "Enter" && this.points.length > 0) {
      return this.finish(false, context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const option = input.trim().toLowerCase();

    if (option === "") {
      return this.points.length > 0 ? this.finish(false, context) : TOOL_RESULT_NONE;
    }

    if (CLOSE_OPTIONS.includes(option)) {
      return this.finish(true, context);
    }

    if (UNDO_OPTIONS.includes(option)) {
      this.points.pop();
      if (this.points.length === 0) {
        this.reset(context);
        return TOOL_RESULT_NONE;
      }
      context.showMessage(NEXT_PROMPT);
      return this.refreshPreview(context);
    }

    const parsed = parseDirectInput(input);
    const last = this.points[this.points.length - 1];

    if (last === undefined) {
      return parsed.kind === "absolute"
        ? this.addPoint({ x: parsed.point.x * context.unitScale, y: parsed.point.y * context.unitScale }, context)
        : { type: "error", message: "[Spline] Specify the first point as x,y or click on the drawing." };
    }

    if (parsed.kind === "invalid" || parsed.kind === "empty") {
      return { type: "error", message: "[Spline] Invalid input. Use x,y, @dx,dy, @dist<angle or a distance." };
    }

    const direction = this.cursorPoint !== null ? subtractPoints(this.cursorPoint, last) : null;
    const point = resolveDirectInput(parsed, last, direction, context.unitScale);

    return point === null
      ? { type: "error", message: "[Spline] Move the cursor to indicate direction before entering a distance." }
      : this.addPoint(point, context);
  }

  private addPoint(point: Point2D, context: ToolContext): ToolResult {
    const last = this.points[this.points.length - 1];

    if (last !== undefined && pointsNearlyEqual(last, point)) {
      return TOOL_RESULT_NONE;
    }

    this.points.push(point);
    this.cursorPoint = point;
    context.showMessage(NEXT_PROMPT);
    return this.refreshPreview(context);
  }

  private finish(closed: boolean, context: ToolContext): ToolResult {
    const minimum = closed ? 3 : 2;

    if (this.points.length < minimum) {
      return { type: "error", message: closed ? "[Spline] A closed spline needs at least 3 points." : "[Spline] A spline needs at least 2 points." };
    }

    const fitPoints = [...this.points];
    const entity: SplineEntity = {
      id: `spline_${crypto.randomUUID()}`,
      layerId: context.document.activeLayerId,
      type: "spline",
      fitPoints,
      closed,
      controlPoints: fitPointsToBezierChain(fitPoints, closed)
    };
    const command = createEntityCommand(entity);

    context.executeCommand(command);
    this.reset(context);
    return { type: "command", command };
  }

  private refreshPreview(context: ToolContext): ToolResult {
    const points = this.cursorPoint !== null && !pointsNearlyEqual(this.cursorPoint, this.points[this.points.length - 1]!)
      ? [...this.points, this.cursorPoint]
      : this.points;

    if (points.length < 2) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview: CadPreview = {
      type: "ghostEntities",
      entities: [
        { id: "preview_spline", layerId: context.document.activeLayerId, type: "spline", closed: false, fitPoints: points, controlPoints: fitPointsToBezierChain(points, false) }
      ]
    };

    context.setPreview(preview);
    return { type: "preview", preview };
  }

  private reset(context: ToolContext): void {
    this.points = [];
    this.cursorPoint = null;
    context.clearPreview();
    context.showMessage("[Spline] Specify first point");
  }
}

const NEXT_PROMPT = "[Spline] Specify next point, Enter to finish, c to close, u to undo";
