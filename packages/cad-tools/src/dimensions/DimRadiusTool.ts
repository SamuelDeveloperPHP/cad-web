import { CreateEntityCommand, getDocumentSpatialIndex, type DimensionEntity, type CircleEntity } from "@cad-web/cad-core";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

export class DimRadiusTool implements CadTool {
  readonly id = "dimRadius";
  readonly name = "DimRadius";
  readonly aliases = ["dra", "dimradius"];

  private targetCircle: CircleEntity | null = null;

  activate(context: ToolContext): void {
    this.reset(context);
    context.showMessage("[DimRadius] Select circle");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = event.worldPoint;

    if (this.targetCircle === null) {
      const index = getDocumentSpatialIndex(context.document);
      const tol = 10 / context.viewport.scale;
      const bbox = { minX: point.x - tol, minY: point.y - tol, maxX: point.x + tol, maxY: point.y + tol };
      const hitEntities = index.query(bbox);
      
      const circle = hitEntities.find((e: any) => e.type === "circle") as CircleEntity | undefined;

      if (!circle) {
        if (hitEntities.length > 0) {
          context.showMessage("Selected entity is not a circle.");
        }
        return TOOL_RESULT_NONE;
      }

      this.targetCircle = circle;
      context.showMessage("[DimRadius] Specify dimension location");
      return TOOL_RESULT_NONE;
    }

    // A ferramenta ja possui o circulo alvo e passa a definir a posicao da cota.
    const leaderEndPoint = resolveSnappedPoint(event, context);
    
    const layerId = context.document.activeLayerId || "layer_0";
    const layer = context.document.layers.find(l => l.id === layerId);
    if (layer?.locked) {
      context.showMessage("Active layer is locked. Cannot create dimension.");
      this.reset(context);
      context.showMessage("[DimRadius] Select circle");
      return TOOL_RESULT_NONE;
    }

    const entity: DimensionEntity = {
      type: "dimension",
      id: `dim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      dimensionType: "radius",
      layerId,
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        targetEntityId: this.targetCircle.id,
        center: this.targetCircle.center,
        radius: this.targetCircle.radius,
        leaderEndPoint
      }
    };

    context.executeCommand(new CreateEntityCommand(entity));
    this.reset(context);
    context.showMessage("[DimRadius] Select circle");

    return TOOL_RESULT_NONE;
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.targetCircle === null) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);

    const previewEntity: DimensionEntity = {
      type: "dimension",
      id: "preview_dim",
      dimensionType: "radius",
      layerId: context.document.activeLayerId || "layer_0",
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        targetEntityId: this.targetCircle.id,
        center: this.targetCircle.center,
        radius: this.targetCircle.radius,
        leaderEndPoint: point
      }
    };

    const preview = {
      type: "ghostEntities" as const,
      entities: [previewEntity]
    };

    context.setPreview(preview);
    return { type: "preview", preview };
  }

  onPointerUp(): ToolResult {
    return TOOL_RESULT_NONE;
  }

  onKeyDown(event: ToolKeyboardEvent, context: ToolContext): ToolResult {
    if (event.key === "Escape") {
      this.reset(context);
      context.showMessage("[DimRadius] Select circle");
      return { type: "cancel" };
    }
    return TOOL_RESULT_NONE;
  }

  onCommandInput(): ToolResult {
    return TOOL_RESULT_NONE;
  }

  private reset(context: ToolContext): void {
    this.targetCircle = null;
    context.clearPreview();
  }
}
