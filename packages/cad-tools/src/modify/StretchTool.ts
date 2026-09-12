import { StretchEntitiesCommand, stretchEntity, type CadEntity } from "@cad-web/cad-core";
import { boundingBoxesIntersect, pointsNearlyEqual, type BoundingBox, type Point2D } from "@cad-web/cad-geometry";
import { entityBoundingBox } from "@cad-web/cad-core";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

type StretchPhase = "window" | "base" | "displace";

/**
 * Ferramenta responsável por esticar entidades. O usuário arrasta uma janela de seleção,
 * escolhe um ponto base e um ponto de destino; os vértices dentro da janela se movem pelo
 * deslocamento e os de fora permanecem, gerando o efeito de esticar.
 */
export class StretchTool implements CadTool {
  readonly id = "stretch";
  readonly name = "Stretch";
  readonly aliases = ["s", "stretch", "esticar"];

  private phase: StretchPhase = "window";
  private windowStart: Point2D | null = null;
  private windowBounds: BoundingBox | null = null;
  private candidates: ReadonlyArray<CadEntity> = [];
  private basePoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.reset();
    context.showMessage("Specify first corner of stretch window.");
  }

  deactivate(context: ToolContext): void {
    this.reset();
    context.clearPreview();
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.phase === "window") {
      if (this.windowStart === null) {
        this.windowStart = point;
        context.showMessage("Specify opposite corner of stretch window.");
        return TOOL_RESULT_NONE;
      }

      return this.finishWindow(this.windowStart, point, context);
    }

    if (this.phase === "base") {
      this.basePoint = point;
      this.phase = "displace";
      context.showMessage("Specify destination point.");
      return TOOL_RESULT_NONE;
    }

    if (this.basePoint === null) {
      return TOOL_RESULT_NONE;
    }

    return this.confirmStretch(point, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.phase === "window" && this.windowStart !== null) {
      const preview: CadPreview = { type: "selectionBox", start: this.windowStart, end: point, mode: "crossing" };
      context.setPreview(preview);
      return { type: "preview", preview };
    }

    if (this.phase === "displace" && this.basePoint !== null) {
      const displacement = { x: point.x - this.basePoint.x, y: point.y - this.basePoint.y };
      const preview: CadPreview = { type: "ghostEntities", entities: this.stretchCandidates(displacement) };
      context.setPreview(preview);
      return { type: "preview", preview };
    }

    return TOOL_RESULT_NONE;
  }

  onPointerUp(_event: ToolPointerEvent, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.reset();
      context.clearPreview();
      context.showMessage("Specify first corner of stretch window.");
      return { type: "cancel" };
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(_input: string, _context: ToolContext): ToolResult {
    return TOOL_RESULT_NONE;
  }

  private finishWindow(cornerA: Point2D, cornerB: Point2D, context: ToolContext): ToolResult {
    if (pointsNearlyEqual(cornerA, cornerB)) {
      return { type: "error", message: "Stretch window is empty." };
    }

    const bounds: BoundingBox = {
      minX: Math.min(cornerA.x, cornerB.x),
      minY: Math.min(cornerA.y, cornerB.y),
      maxX: Math.max(cornerA.x, cornerB.x),
      maxY: Math.max(cornerA.y, cornerB.y)
    };

    const lockedLayerIds = new Set(
      context.document.layers.filter((layer) => layer.locked).map((layer) => layer.id)
    );

    // Uma entidade é candidata quando seu retângulo envolvente cruza a janela e a camada não está bloqueada.
    const candidates = context.document.entities.filter(
      (entity) =>
        !lockedLayerIds.has(entity.layerId || "layer_0") &&
        boundingBoxesIntersect(entityBoundingBox(entity), bounds)
    );

    if (candidates.length === 0) {
      this.reset();
      context.clearPreview();
      context.showMessage("No entities in the stretch window. Specify first corner of stretch window.");
      return { type: "error", message: "No entities in the stretch window." };
    }

    this.windowBounds = bounds;
    this.candidates = candidates;
    this.phase = "base";
    context.clearPreview();
    // As entidades apanhadas pela janela ficam selecionadas (traço tracejado) como feedback, ligando o Stretch à seleção por área.
    context.selectEntities(candidates.map((entity) => entity.id));
    context.showMessage(`${candidates.length} entit${candidates.length === 1 ? "y" : "ies"} in window. Specify base point.`);
    return TOOL_RESULT_NONE;
  }

  private stretchCandidates(displacement: Point2D): CadEntity[] {
    if (this.windowBounds === null) {
      return [];
    }

    const bounds = this.windowBounds;

    return this.candidates.map((entity) => stretchEntity(entity, bounds, displacement));
  }

  private confirmStretch(destination: Point2D, context: ToolContext): ToolResult {
    if (this.basePoint === null || this.windowBounds === null) {
      return TOOL_RESULT_NONE;
    }

    const displacement = { x: destination.x - this.basePoint.x, y: destination.y - this.basePoint.y };

    if (pointsNearlyEqual(this.basePoint, destination)) {
      return { type: "error", message: "Displacement must be greater than zero." };
    }

    const bounds = this.windowBounds;
    // O comando recebe apenas as entidades que realmente mudaram de geometria.
    const changed = this.candidates
      .map((entity) => stretchEntity(entity, bounds, displacement))
      .filter((entity, index) => entity !== this.candidates[index]);

    if (changed.length === 0) {
      this.reset();
      context.clearPreview();
      return { type: "error", message: "No entities were stretched." };
    }

    const command = new StretchEntitiesCommand(changed);
    context.executeCommand(command);
    this.reset();
    context.clearPreview();
    context.showMessage("Specify first corner of stretch window.");

    return { type: "command", command };
  }

  private reset(): void {
    this.phase = "window";
    this.windowStart = null;
    this.windowBounds = null;
    this.candidates = [];
    this.basePoint = null;
  }
}
