import { CreateEntityCommand, type DimensionEntity } from "@cad-web/cad-core";
import { type DimensionStyleGeom } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";
import type { Point2D } from "@cad-web/cad-geometry";

const DEFAULT_STYLE: DimensionStyleGeom = {
  textHeight: 12,
  arrowSize: 6,
  extensionOffset: 2,
  extensionOvershoot: 3,
  precision: 2,
  unitSuffix: " mm",
  arrowType: "tick"
};

export class DimLinearTool implements CadTool {
  readonly id = "dimLinear";
  readonly name = "DimLinear";
  readonly aliases = ["dli", "dimlinear"];

  private firstPoint: Point2D | null = null;
  private secondPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.reset(context);
    context.showMessage("[DimLinear] Specify first extension line origin");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.firstPoint === null) {
      this.firstPoint = point;
      context.showMessage("[DimLinear] Specify second extension line origin");
      return TOOL_RESULT_NONE;
    }

    if (this.secondPoint === null) {
      this.secondPoint = point;
      context.showMessage("[DimLinear] Specify dimension line location");
      return TOOL_RESULT_NONE;
    }

    // O terceiro ponto define a posicao da linha de cota.
    const layerId = context.document.activeLayerId || "layer_0";
    const layer = context.document.layers.find(l => l.id === layerId);
    if (layer?.locked) {
      context.showMessage("Active layer is locked. Cannot create dimension.");
      this.reset(context);
      context.showMessage("[DimLinear] Specify first extension line origin");
      return TOOL_RESULT_NONE;
    }

    const entity: DimensionEntity = {
      type: "dimension",
      id: `dim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      dimensionType: "linear",
      layerId,
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        firstPoint: this.firstPoint,
        secondPoint: this.secondPoint,
        dimensionLinePoint: point,
        orientation: "auto"
      }
    };

    context.executeCommand(new CreateEntityCommand(entity));
    this.reset(context);
    context.showMessage("[DimLinear] Specify first extension line origin");

    return TOOL_RESULT_NONE;
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.firstPoint === null || this.secondPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);

    const previewEntity: DimensionEntity = {
      type: "dimension",
      id: "preview_dim",
      dimensionType: "linear",
      layerId: context.document.activeLayerId || "layer_0",
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        firstPoint: this.firstPoint,
        secondPoint: this.secondPoint,
        dimensionLinePoint: point,
        orientation: "auto"
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
      return { type: "cancel" };
    }
    return TOOL_RESULT_NONE;
  }

  onCommandInput(): ToolResult {
    return TOOL_RESULT_NONE;
  }

  private reset(context: ToolContext): void {
    this.firstPoint = null;
    this.secondPoint = null;
    context.clearPreview();
  }
}

export class DimAlignedTool implements CadTool {
  readonly id = "dimAligned";
  readonly name = "DimAligned";
  readonly aliases = ["dal", "dimaligned"];

  private firstPoint: Point2D | null = null;
  private secondPoint: Point2D | null = null;

  activate(context: ToolContext): void {
    this.reset(context);
    context.showMessage("[DimAligned] Specify first extension line origin");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = resolveSnappedPoint(event, context);

    if (this.firstPoint === null) {
      this.firstPoint = point;
      context.showMessage("[DimAligned] Specify second extension line origin");
      return TOOL_RESULT_NONE;
    }

    if (this.secondPoint === null) {
      this.secondPoint = point;
      context.showMessage("[DimAligned] Specify dimension line location");
      return TOOL_RESULT_NONE;
    }

    const layerId = context.document.activeLayerId || "layer_0";
    const layer = context.document.layers.find(l => l.id === layerId);
    if (layer?.locked) {
      context.showMessage("Active layer is locked. Cannot create dimension.");
      this.reset(context);
      context.showMessage("[DimAligned] Specify first extension line origin");
      return TOOL_RESULT_NONE;
    }

    const entity: DimensionEntity = {
      type: "dimension",
      id: `dim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      dimensionType: "aligned",
      layerId,
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        firstPoint: this.firstPoint,
        secondPoint: this.secondPoint,
        dimensionLinePoint: point
      }
    };

    context.executeCommand(new CreateEntityCommand(entity));
    this.reset(context);
    context.showMessage("[DimAligned] Specify first extension line origin");

    return TOOL_RESULT_NONE;
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (this.firstPoint === null || this.secondPoint === null) {
      return TOOL_RESULT_NONE;
    }

    const point = resolveSnappedPoint(event, context);

    const previewEntity: DimensionEntity = {
      type: "dimension",
      id: "preview_dim",
      dimensionType: "aligned",
      layerId: context.document.activeLayerId || "layer_0",
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        firstPoint: this.firstPoint,
        secondPoint: this.secondPoint,
        dimensionLinePoint: point
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
      return { type: "cancel" };
    }
    return TOOL_RESULT_NONE;
  }

  onCommandInput(): ToolResult {
    return TOOL_RESULT_NONE;
  }

  private reset(context: ToolContext): void {
    this.firstPoint = null;
    this.secondPoint = null;
    context.clearPreview();
  }
}
