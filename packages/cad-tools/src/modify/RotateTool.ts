import { rotateEntity, type CadEntity } from "@cad-web/cad-core";
import { pointsNearlyEqual, subtractPoints, visualDegreesToWorldRadians, type Point2D } from "@cad-web/cad-geometry";
import { rotateEntitiesCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

/**
 * Ferramenta responsável por rotacionar as entidades selecionadas em torno de um pivô.
 * O ângulo digitado segue a convenção do AutoCAD: graus, positivo no sentido anti-horário da tela
 * (o Y do mundo cresce para baixo, então o ângulo é convertido por visualDegreesToWorldRadians).
 * O ângulo por clique é o da reta pivô → ponto, que já é o mesmo na tela.
 */
export class RotateTool implements CadTool {
  readonly id = "rotate";
  readonly name = "Rotate";
  readonly aliases = ["ro", "rotate"];

  private basePoint: Point2D | null = null;
  private currentPoint: Point2D | null = null;
  private explicitAngle: number | null = null;

  activate(context: ToolContext): void {
    this.basePoint = null;
    this.currentPoint = null;
    this.explicitAngle = null;

    if (context.selection.entityIds.length === 0) {
      context.showMessage("Select entities before ROTATE.");
      return;
    }

    context.showMessage("Specify base point for ROTATE.");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (context.selection.entityIds.length === 0) {
      return { type: "error", message: "Rotate requires selected entities." };
    }

    const point = resolveSnappedPoint(event, context);

    if (this.basePoint === null) {
      this.basePoint = point;
      this.currentPoint = point;
      context.showMessage("Specify rotation angle (degrees, counterclockwise) or click destination point.");
      return TOOL_RESULT_NONE;
    }

    // Se já tinha base, calcula o ângulo do ponteiro
    const angleRadians = Math.atan2(point.y - this.basePoint.y, point.x - this.basePoint.x);
    return this.confirmRotate(this.basePoint, angleRadians, context);
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.basePoint === null || context.selection.entityIds.length === 0) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);
    this.currentPoint = point;
    
    // Se não tiver deslocamento suficiente do pivô, não exibe o preview (pode bugar o atan2 ou ficar piscando)
    if (pointsNearlyEqual(this.basePoint, point)) {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }

    const angleRadians = this.explicitAngle ?? Math.atan2(point.y - this.basePoint.y, point.x - this.basePoint.x);
    
    const preview = {
      type: "ghostEntities" as const,
      entities: getSelectedEntities(context).map((entity) => rotateEntity(entity, this.basePoint!, angleRadians))
    };

    // Atualiza preview na tela
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

    if (event.key === "Enter" && this.basePoint !== null && this.currentPoint !== null) {
      const angleRadians = this.explicitAngle ?? Math.atan2(this.currentPoint.y - this.basePoint.y, this.currentPoint.x - this.basePoint.x);
      return this.confirmRotate(this.basePoint, angleRadians, context);
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    if (this.basePoint !== null) {
      const text = input.trim();
      const parsedValue = Number(text);
      if (text.length > 0 && Number.isFinite(parsedValue)) {
        // Graus na convenção do AutoCAD (anti-horário na tela), convertidos para o ângulo do mundo.
        const angleRadians = visualDegreesToWorldRadians(parsedValue);
        return this.confirmRotate(this.basePoint, angleRadians, context);
      } else if (input.trim().length === 0 && this.currentPoint !== null) {
        // Usuário apenas deu enter
        const angleRadians = Math.atan2(this.currentPoint.y - this.basePoint.y, this.currentPoint.x - this.basePoint.x);
        return this.confirmRotate(this.basePoint, angleRadians, context);
      }
    }
    return TOOL_RESULT_NONE;
  }

  private confirmRotate(pivot: Point2D, angleRadians: number, context: ToolContext): ToolResult {
    const lockedLayerIds = new Set(
      context.document.layers.filter((l) => l.locked).map((l) => l.id)
    );

    const validEntityIds = context.selection.entityIds.filter((id) => {
      const entity = context.document.entities.find((e) => e.id === id);
      return entity && !lockedLayerIds.has(entity.layerId || "layer_0");
    });

    if (validEntityIds.length === 0) {
      return { type: "error", message: "No modifiable entities selected." };
    }

    const command = rotateEntitiesCommand(validEntityIds, pivot, angleRadians);
    context.executeCommand(command);
    this.reset(context);

    return { type: "command", command };
  }

  private reset(context: ToolContext): void {
    this.basePoint = null;
    this.currentPoint = null;
    this.explicitAngle = null;
    context.clearPreview();
  }
}

function getSelectedEntities(context: ToolContext): ReadonlyArray<CadEntity> {
  const selectedIds = new Set(context.selection.entityIds);

  const lockedLayerIds = new Set(
    context.document.layers.filter((l) => l.locked).map((l) => l.id)
  );

  return context.document.entities.filter(
    (entity) => selectedIds.has(entity.id) && !lockedLayerIds.has(entity.layerId || "layer_0")
  );
}
