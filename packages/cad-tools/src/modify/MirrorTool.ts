import { MirrorEntitiesCommand, mirrorEntity, type CadEntity } from "@cad-web/cad-core";
import { pointsNearlyEqual, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { CadPreview, ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

/**
 * Ferramenta responsável por espelhar as entidades selecionadas em torno de um eixo.
 * O usuário define o eixo com dois cliques e a ferramenta cria uma cópia refletida,
 * mantendo o original. Apagar o original ao espelhar depende de um seletor dedicado e
 * fica para uma etapa futura, pois letras na linha de comando colidem com aliases globais.
 */
export class MirrorTool implements CadTool {
  readonly id = "mirror";
  readonly name = "Mirror";
  readonly aliases = ["mi", "mirror", "espelhar"];

  private firstPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.firstPoint = null;

    if (context.selection.entityIds.length === 0) {
      context.showMessage("Select entities before MIRROR.");
      return;
    }

    context.showMessage("Specify first point of mirror axis.");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (context.selection.entityIds.length === 0) {
      return { type: "error", message: "Mirror requires selected entities." };
    }

    const point = resolveSnappedPoint(event, context);

    if (this.firstPoint === null) {
      this.firstPoint = point;
      context.showMessage("Specify second point of mirror axis.");
      return TOOL_RESULT_NONE;
    }

    if (pointsNearlyEqual(this.firstPoint, point)) {
      return { type: "error", message: "Mirror axis points must be distinct." };
    }

    return this.confirmMirror(this.firstPoint, point, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.firstPoint === null || context.selection.entityIds.length === 0) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);

    if (pointsNearlyEqual(this.firstPoint, point)) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const mirrored = this.mirrorSelected(this.firstPoint, point, context);

    if (mirrored.length === 0) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const preview: CadPreview = { type: "ghostEntities", entities: mirrored };
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

  onCommandInput(_input: string, _context: ToolContext): ToolResult {
    // O eixo de espelhamento é definido apenas por cliques; não há entrada numérica nesta ferramenta.
    return TOOL_RESULT_NONE;
  }

  private mirrorSelected(
    axisStart: Point2D,
    axisEnd: Point2D,
    context: ToolContext,
    idFactory?: (index: number) => string
  ): CadEntity[] {
    const entities = getSelectedEntities(context);
    const mirrored: CadEntity[] = [];

    entities.forEach((entity, index) => {
      const reflected = mirrorEntity(entity, axisStart, axisEnd);

      if (reflected === null) {
        return;
      }

      mirrored.push(idFactory === undefined ? reflected : { ...reflected, id: idFactory(index) });
    });

    return mirrored;
  }

  private confirmMirror(axisStart: Point2D, axisEnd: Point2D, context: ToolContext): ToolResult {
    const sourceEntities = getSelectedEntities(context);

    if (sourceEntities.length === 0) {
      return { type: "error", message: "No modifiable entities selected." };
    }

    const mirrored = this.mirrorSelected(axisStart, axisEnd, context, () => `mirror_${crypto.randomUUID()}`);

    if (mirrored.length === 0) {
      return { type: "error", message: "Selected entities cannot be mirrored." };
    }

    const skipped = sourceEntities.length - mirrored.length;

    if (skipped > 0) {
      // As cotas ainda não são espelhadas nesta fase; a ferramenta avisa quando ignora alguma entidade.
      context.showMessage(`${skipped} dimension(s) were not mirrored.`);
    }

    const command = new MirrorEntitiesCommand(
      sourceEntities.map((entity) => entity.id),
      mirrored,
      true
    );

    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private reset(context: ToolContext): void {
    this.firstPoint = null;
    context.clearPreview();
  }
}

function getSelectedEntities(context: ToolContext): ReadonlyArray<CadEntity> {
  const selectedIds = new Set(context.selection.entityIds);
  const lockedLayerIds = new Set(
    context.document.layers.filter((layer) => layer.locked).map((layer) => layer.id)
  );

  return context.document.entities.filter(
    (entity) => selectedIds.has(entity.id) && !lockedLayerIds.has(entity.layerId || "layer_0")
  );
}
