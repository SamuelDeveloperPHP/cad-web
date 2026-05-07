import type { CadEntity, PolylineEntity } from "@cad-web/cad-core";
import { isValidPolyline, pointsNearlyEqual, type Point2D } from "@cad-web/cad-geometry";
import { createEntityCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

// O modulo descreve a ferramenta interativa Polyline, que cria sequencias de segmentos retos por cliques.
// O fluxo segue o padrao das demais ferramentas: maquina de estados, preview ghost e geracao de comando apenas na finalizacao.

type PolylinePhase = "waiting_first_point" | "drawing_polyline";

export class PolylineTool implements CadTool {
  readonly id = "polyline";
  readonly name = "Polyline";
  readonly aliases = ["pl", "polyline", "polilinha"];

  private phase: PolylinePhase = "waiting_first_point";
  private points: Point2D[] = [];
  private cursorPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    // O metodo reinicia todo o estado interno e exibe o prompt inicial.
    this.points = [];
    this.cursorPoint = null;
    this.phase = "waiting_first_point";
    context.clearPreview();

    if (this.isActiveLayerLocked(context)) {
      context.showMessage("[Polyline] Layer is locked");
      return;
    }

    context.showMessage("[Polyline] Specify first point");
  }

  deactivate(context: ToolContext): void {
    this.points = [];
    this.cursorPoint = null;
    this.phase = "waiting_first_point";
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (event.button !== "primary") {
      return TOOL_RESULT_NONE;
    }

    if (this.isActiveLayerLocked(context)) {
      context.showMessage("[Polyline] Layer is locked");
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);

    if (this.phase === "waiting_first_point") {
      this.points = [point];
      this.cursorPoint = point;
      this.phase = "drawing_polyline";
      context.showMessage("[Polyline] Specify next point or Enter to finish");
      this.refreshPreview(context);
      return TOOL_RESULT_NONE;
    }

    const lastPoint = this.points[this.points.length - 1];

    if (lastPoint !== undefined && pointsNearlyEqual(lastPoint, point)) {
      // O ponto duplicado e ignorado para evitar segmentos de comprimento zero.
      return TOOL_RESULT_NONE;
    }

    this.points.push(point);
    this.cursorPoint = point;
    context.showMessage("[Polyline] Specify next point or Enter to finish (C close, U undo)");
    this.refreshPreview(context);
    return TOOL_RESULT_NONE;
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.phase !== "drawing_polyline") {
      return TOOL_RESULT_NONE;
    }

    this.cursorPoint = resolveSnappedPoint(event, context);
    this.refreshPreview(context);

    return TOOL_RESULT_NONE;
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      // O Esc cancela a criacao sem alterar o documento.
      this.points = [];
      this.cursorPoint = null;
      this.phase = "waiting_first_point";
      context.clearPreview();
      context.showMessage("[Polyline] Cancelled");
      return { type: "cancel" };
    }

    if (event.key === "Enter") {
      return this.finalizeAsOpen(context);
    }

    const lowered = event.key.toLowerCase();

    if (lowered === "c") {
      return this.finalizeAsClosed(context);
    }

    if (lowered === "u") {
      return this.undoLastVertex(context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    // O metodo aceita atalhos textuais alem dos eventos de teclado para integrar com a linha de comando.
    const normalized = input.trim().toLowerCase();

    if (normalized.length === 0) {
      return this.finalizeAsOpen(context);
    }

    if (normalized === "c" || normalized === "close" || normalized === "fechar") {
      return this.finalizeAsClosed(context);
    }

    if (normalized === "u" || normalized === "undo" || normalized === "desfazer") {
      return this.undoLastVertex(context);
    }

    return TOOL_RESULT_NONE;
  }

  private finalizeAsOpen(context: ToolContext): ToolResult {
    if (this.phase !== "drawing_polyline" || this.points.length < 2) {
      context.showMessage("[Polyline] Not enough points");
      return { type: "error", message: "[Polyline] Not enough points" };
    }

    return this.commitPolyline(context, false);
  }

  private finalizeAsClosed(context: ToolContext): ToolResult {
    if (this.phase !== "drawing_polyline" || this.points.length < 3) {
      context.showMessage("[Polyline] Not enough points");
      return { type: "error", message: "[Polyline] Not enough points" };
    }

    return this.commitPolyline(context, true);
  }

  private undoLastVertex(context: ToolContext): ToolResult {
    if (this.phase !== "drawing_polyline" || this.points.length === 0) {
      return TOOL_RESULT_NONE;
    }

    this.points.pop();

    if (this.points.length === 0) {
      this.phase = "waiting_first_point";
      this.cursorPoint = null;
      context.clearPreview();
      context.showMessage("[Polyline] Specify first point");
      return TOOL_RESULT_NONE;
    }

    this.refreshPreview(context);
    context.showMessage("[Polyline] Specify next point or Enter to finish (C close, U undo)");
    return TOOL_RESULT_NONE;
  }

  private commitPolyline(context: ToolContext, closed: boolean): ToolResult {
    const finalPoints = this.points.map((point) => ({ ...point }));

    if (!isValidPolyline(finalPoints, closed)) {
      context.showMessage("[Polyline] Not enough points");
      return { type: "error", message: "[Polyline] Not enough points" };
    }

    if (this.isActiveLayerLocked(context)) {
      context.showMessage("[Polyline] Layer is locked");
      return { type: "error", message: "[Polyline] Layer is locked" };
    }

    const entity = createPolylineEntity(finalPoints, closed, context.document.activeLayerId);
    const command = createEntityCommand(entity);
    context.executeCommand(command);
    this.points = [];
    this.cursorPoint = null;
    this.phase = "waiting_first_point";
    context.clearPreview();
    context.showMessage("[Polyline] Specify first point");

    return { type: "command", command };
  }

  private refreshPreview(context: ToolContext): void {
    // O preview combina os segmentos confirmados e o rubber band ate o cursor atual.
    if (this.points.length === 0) {
      context.clearPreview();
      return;
    }

    const previewPoints = [...this.points];

    if (this.cursorPoint !== null) {
      const lastPoint = previewPoints[previewPoints.length - 1];

      if (lastPoint === undefined || !pointsNearlyEqual(lastPoint, this.cursorPoint)) {
        previewPoints.push(this.cursorPoint);
      }
    }

    if (previewPoints.length < 2) {
      context.clearPreview();
      return;
    }

    const ghost: PolylineEntity = {
      id: "polyline_preview",
      layerId: context.document.activeLayerId,
      type: "polyline",
      points: previewPoints,
      closed: false
    };

    context.setPreview({
      type: "ghostEntities",
      entities: [ghost as CadEntity]
    });
  }

  private isActiveLayerLocked(context: ToolContext): boolean {
    const layer = context.document.layers.find((candidate) => candidate.id === context.document.activeLayerId);
    return layer?.locked === true;
  }
}

function createPolylineEntity(points: ReadonlyArray<Point2D>, closed: boolean, layerId: string): PolylineEntity {
  // O metodo gera identificador unico aproveitando crypto.randomUUID quando disponivel.
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `polyline_${crypto.randomUUID()}`
      : `polyline_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

  return {
    id,
    layerId,
    type: "polyline",
    points,
    closed
  };
}
