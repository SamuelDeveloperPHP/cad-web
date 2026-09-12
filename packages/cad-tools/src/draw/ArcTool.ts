import type { ArcGeometry, Point2D } from "@cad-web/cad-geometry";
import { computeArcFromCenterStartEnd, computeArcFromThreePoints } from "@cad-web/cad-geometry";
import type { ArcEntity } from "@cad-web/cad-core";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

export type ArcToolMode = "threePoints" | "centerStartEnd";

const MODE_INPUTS: Readonly<Record<string, ArcToolMode>> = {
  ce: "centerStartEnd",
  center: "centerStartEnd",
  centro: "centerStartEnd",
  "3p": "threePoints",
  "3pontos": "threePoints",
  "3points": "threePoints"
};

/**
 * Ferramenta responsável por desenhar arcos.
 * O modo padrão usa três pontos (início, ponto sobre o arco, fim); o modo alternativo usa
 * centro, ponto inicial e ponto final, ativado pela entrada "ce" na linha de comando (a letra "c" isolada é alias do CircleTool).
 */
export class ArcTool implements CadTool {
  readonly id = "arc";
  readonly name = "Arc";
  readonly aliases = ["a", "arc", "arco"];

  private mode: ArcToolMode = "threePoints";
  private readonly points: Point2D[] = [];

  activate(context: ToolContext): void {
    this.mode = "threePoints";
    this.points.length = 0;
    this.showStepMessage(context);
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    this.points.push(point);

    if (this.points.length < 3) {
      this.showStepMessage(context);
      return TOOL_RESULT_NONE;
    }

    return this.confirmArc(context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.points.length === 0) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);
    const preview = this.buildPreview(point, context);

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
    const text = input.trim().toLowerCase();

    if (text === "") {
      return TOOL_RESULT_NONE;
    }

    const requestedMode = MODE_INPUTS[text];

    if (requestedMode === undefined) {
      return { type: "error", message: "Invalid input. Use 'ce' for center mode or '3p' for three points." };
    }

    // A troca de modo só é permitida antes do primeiro ponto para não invalidar pontos já coletados.
    if (this.points.length > 0) {
      return { type: "error", message: "Press Esc before changing the arc mode." };
    }

    this.mode = requestedMode;
    this.showStepMessage(context);
    return { type: "message", message: this.currentPrompt() };
  }

  private buildPreview(cursor: Point2D, context: ToolContext): CadPreview {
    const first = this.points[0];
    const second = this.points[1];

    if (first === undefined) {
      return { type: "rubberBand", from: cursor, to: cursor };
    }

    if (second === undefined) {
      return { type: "rubberBand", from: first, to: cursor };
    }

    const result = this.computeArc(first, second, cursor);

    if (!result.ok) {
      return { type: "rubberBand", from: first, to: cursor };
    }

    return {
      type: "ghostEntities",
      entities: [this.createArcEntity(result.arc, "preview_arc", context.document.activeLayerId)]
    };
  }

  private computeArc(first: Point2D, second: Point2D, third: Point2D) {
    return this.mode === "threePoints"
      ? computeArcFromThreePoints(first, second, third)
      : computeArcFromCenterStartEnd(first, second, third);
  }

  private confirmArc(context: ToolContext): ToolResult {
    const [first, second, third] = this.points;

    if (first === undefined || second === undefined || third === undefined) {
      return TOOL_RESULT_NONE;
    }

    const result = this.computeArc(first, second, third);

    if (!result.ok) {
      // O último ponto é descartado para o usuário escolher outro sem reiniciar a ferramenta.
      this.points.pop();
      context.showMessage(result.reason);
      return { type: "error", message: result.reason };
    }

    const entity = this.createArcEntity(result.arc, `arc_${crypto.randomUUID()}`, context.document.activeLayerId);
    const command = createEntityCommand(entity);

    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private createArcEntity(arc: ArcGeometry, id: string, layerId: string): ArcEntity {
    return {
      id,
      layerId,
      type: "arc",
      center: arc.center,
      radius: arc.radius,
      startAngle: arc.startAngle,
      endAngle: arc.endAngle,
      clockwise: arc.clockwise
    };
  }

  private currentPrompt(): string {
    const step = this.points.length;

    if (this.mode === "centerStartEnd") {
      if (step === 0) {
        return "Specify center point of arc.";
      }

      return step === 1 ? "Specify start point of arc." : "Specify end point of arc.";
    }

    if (step === 0) {
      return "Specify start point of arc or [ce] for center mode.";
    }

    return step === 1 ? "Specify second point on arc." : "Specify end point of arc.";
  }

  private showStepMessage(context: ToolContext): void {
    context.showMessage(this.currentPrompt());
  }

  private reset(context: ToolContext): void {
    this.mode = "threePoints";
    this.points.length = 0;
    context.clearPreview();
    this.showStepMessage(context);
  }
}
