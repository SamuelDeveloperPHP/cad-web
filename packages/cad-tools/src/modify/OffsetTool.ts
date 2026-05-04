import { CreateEntityCommand, type CadEntity } from "@cad-web/cad-core";
import { offsetCircle, offsetLine, offsetRectangle } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { findNearestEntityId } from "../selection/hitTesting";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

export class OffsetTool implements CadTool {
  readonly id = "offset";
  readonly name = "Offset";
  readonly aliases = ["o", "offset"];

  private distance: number | null = null;
  private targetEntity: CadEntity | null = null;

  activate(context: ToolContext): void {
    this.distance = null;
    this.targetEntity = null;
    context.showMessage("[Offset] Specify offset distance");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.distance === null) {
      context.showMessage("[Offset] Specify offset distance before clicking.");
      return TOOL_RESULT_NONE;
    }

    if (this.targetEntity === null) {
      // Phase 2: Select entity
      const hitId = findNearestEntityId(context.document, {
        worldPoint: point,
        toleranceWorld: 10 / context.viewport.scale // 10px screen tolerance
      });

      if (!hitId) {
        context.showMessage("No entity selected. [Offset] Select entity to offset");
        return TOOL_RESULT_NONE;
      }

      const entity = context.document.entities.find(e => e.id === hitId);
      if (!entity) return TOOL_RESULT_NONE;

      const layer = context.document.layers.find(l => l.id === entity.layerId);
      if (layer?.locked) {
        context.showMessage("Layer is locked. Offset blocked.");
        return TOOL_RESULT_NONE;
      }

      if (entity.type !== "line" && entity.type !== "rectangle" && entity.type !== "circle") {
        context.showMessage(`Entity type not supported by offset yet.`);
        return TOOL_RESULT_NONE;
      }

      this.targetEntity = entity;
      context.showMessage("[Offset] Specify side to offset");
      return TOOL_RESULT_NONE;
    } else {
      // Phase 3: Specify side
      const newEntity = this.computeOffsetEntity(point);
      if (!newEntity) {
        context.showMessage("Invalid offset side/distance for this geometry.");
        return TOOL_RESULT_NONE;
      }

      context.executeCommand(new CreateEntityCommand(newEntity));
      
      // AutoCAD loop: keep distance, reset target
      this.targetEntity = null;
      context.clearPreview();
      context.showMessage("[Offset] Select entity to offset");
      return TOOL_RESULT_NONE;
    }
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.distance === null || this.targetEntity === null) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);
    const newEntity = this.computeOffsetEntity(point);

    if (newEntity) {
      const preview = {
        type: "ghostEntities" as const,
        entities: [newEntity]
      };
      context.setPreview(preview);
      return { type: "preview", preview };
    } else {
      context.clearPreview();
      return TOOL_RESULT_NONE;
    }
  }

  onPointerUp(): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      if (this.targetEntity !== null) {
        // Step back
        this.targetEntity = null;
        context.clearPreview();
        context.showMessage("[Offset] Select entity to offset");
        return { type: "cancel" };
      } else {
        // Full cancel
        this.reset(context);
        return { type: "cancel" };
      }
    }

    return TOOL_RESULT_NONE;
  }

  onCommandInput(input: string, context: ToolContext): ToolResult {
    const text = input.trim().toLowerCase();

    if (this.distance === null) {
      let valText = text;
      if (valText.startsWith("d=")) valText = valText.substring(2);
      else if (valText.startsWith("distance=")) valText = valText.substring(9);

      const parsed = parseFloat(valText);
      if (isNaN(parsed) || !isFinite(parsed) || parsed <= 0) {
        context.showMessage("Invalid distance. Must be > 0. [Offset] Specify offset distance");
        return TOOL_RESULT_NONE;
      }

      this.distance = parsed;
      context.showMessage("[Offset] Select entity to offset");
      return TOOL_RESULT_NONE;
    }

    return TOOL_RESULT_NONE;
  }

  private computeOffsetEntity(sidePoint: {x: number, y: number}): CadEntity | null {
    if (!this.targetEntity || this.distance === null) return null;

    let offsetGeom: any = null;

    if (this.targetEntity.type === "line") {
      offsetGeom = offsetLine(this.targetEntity as any, this.distance, sidePoint);
    } else if (this.targetEntity.type === "rectangle") {
      const rectGeom = {
        type: "rectangle" as const,
        origin: { x: this.targetEntity.x, y: this.targetEntity.y },
        width: this.targetEntity.width,
        height: this.targetEntity.height,
        rotation: this.targetEntity.rotation || 0
      };
      const resultGeom = offsetRectangle(rectGeom, this.distance, sidePoint);
      if (resultGeom) {
        offsetGeom = {
          type: "rectangle",
          x: resultGeom.origin.x,
          y: resultGeom.origin.y,
          width: resultGeom.width,
          height: resultGeom.height,
          rotation: resultGeom.rotation
        };
      }
    } else if (this.targetEntity.type === "circle") {
      offsetGeom = offsetCircle(this.targetEntity as any, this.distance, sidePoint);
    }

    if (!offsetGeom) return null;

    // Preserve layer, color, thickness, lineType
    const newEntity = {
      ...offsetGeom,
      id: `offset_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      layerId: this.targetEntity.layerId || "layer_0"
    };

    if ((this.targetEntity as any).color) newEntity.color = (this.targetEntity as any).color;
    if ((this.targetEntity as any).lineThickness !== undefined) newEntity.lineThickness = (this.targetEntity as any).lineThickness;
    if ((this.targetEntity as any).lineType) newEntity.lineType = (this.targetEntity as any).lineType;

    return newEntity as CadEntity;
  }

  private reset(context: ToolContext): void {
    this.distance = null;
    this.targetEntity = null;
    context.clearPreview();
  }
}
