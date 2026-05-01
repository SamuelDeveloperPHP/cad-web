import { rotateEntity, type CadEntity } from "@cad-web/cad-core";
import { pointsNearlyEqual, subtractPoints, type Point2D } from "@cad-web/cad-geometry";
import { rotateEntitiesCommand } from "../commands/CadCommandTypes";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import type { ToolResult } from "../contracts/ToolResult";
import { TOOL_RESULT_NONE } from "../contracts/ToolResult";

/**
 * Ferramenta responsável por rotacionar as entidades selecionadas em torno de um pivô.
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

    const point = context.snapService.findSnap(event.worldPoint, context)?.point ?? event.worldPoint;

    if (this.basePoint === null) {
      this.basePoint = point;
      this.currentPoint = point;
      context.showMessage("Specify rotation angle or click destination point.");
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

    const point = context.snapService.findSnap(event.worldPoint, context)?.point ?? event.worldPoint;
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
      const parsedValue = parseFloat(input);
      if (!isNaN(parsedValue)) {
        // Assume que a entrada numérica no console é em graus, converte para radianos
        const angleRadians = (parsedValue * Math.PI) / 180;
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
    const command = rotateEntitiesCommand(context.selection.entityIds, pivot, angleRadians);
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

  return context.document.entities.filter((entity) => selectedIds.has(entity.id));
}
