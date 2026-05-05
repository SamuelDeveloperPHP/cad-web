import { CreateEntityCommand, getDocumentSpatialIndex, type DimensionEntity, type LineEntity } from "@cad-web/cad-core";
import { intersectInfiniteLines, type Point2D } from "@cad-web/cad-geometry";
import type { CadTool } from "../contracts/CadTool";
import type { ToolContext } from "../contracts/ToolContext";
import type { ToolKeyboardEvent, ToolPointerEvent } from "../contracts/ToolEvent";
import { TOOL_RESULT_NONE, type ToolResult } from "../contracts/ToolResult";
import { resolveSnappedPoint } from "../snaps/ObjectSnapService";

const DEFAULT_STYLE = {
  textHeight: 12,
  arrowSize: 6,
  extensionOffset: 2,
  extensionOvershoot: 3,
  precision: 2,
  unitSuffix: "°",
  arrowType: "tick"
};

export class DimAngularTool implements CadTool {
  readonly id = "dimAngular";
  readonly name = "DimAngular";
  readonly aliases = ["dan", "dimangular"];

  private firstLine: LineEntity | null = null;
  private secondLine: LineEntity | null = null;

  activate(context: ToolContext): void {
    this.reset(context);
    context.showMessage("[DimAngular] Select first line");
  }

  deactivate(context: ToolContext): void {
    this.reset(context);
  }

  onPointerDown(event: ToolPointerEvent, context: ToolContext): ToolResult {
    const point = event.worldPoint;

    if (!this.firstLine || !this.secondLine) {
      const index = getDocumentSpatialIndex(context.document);
      const tol = 10 / context.viewport.scale;
      const bbox = { minX: point.x - tol, minY: point.y - tol, maxX: point.x + tol, maxY: point.y + tol };
      const hitEntities = index.query(bbox);

      const line = hitEntities.find((e: any) => e.type === "line") as LineEntity | undefined;

      if (!line) {
        if (hitEntities.length > 0) {
          context.showMessage("[DimAngular] Only line entities are supported in this MVP.");
        }
        return TOOL_RESULT_NONE;
      }

      if (!this.firstLine) {
        this.firstLine = line;
        context.showMessage("[DimAngular] Select second line");
      } else {
        if (this.firstLine.id === line.id) {
          return TOOL_RESULT_NONE;
        }
        
        const vertex = intersectInfiniteLines(this.firstLine.start, this.firstLine.end, line.start, line.end);
        
        if (!vertex) {
          context.showMessage("[DimAngular] Lines are parallel or nearly parallel.");
          return TOOL_RESULT_NONE;
        }
        
        this.secondLine = line;
        context.showMessage("[DimAngular] Specify dimension arc location");
      }

      return TOOL_RESULT_NONE;
    }

    // A terceira etapa define a posicao do arco da cota angular.
    const arcPoint = resolveSnappedPoint(event, context);
    const vertex = intersectInfiniteLines(this.firstLine.start, this.firstLine.end, this.secondLine.start, this.secondLine.end);
    if (!vertex) return TOOL_RESULT_NONE;

    const layerId = context.document.activeLayerId || "layer_0";
    const layer = context.document.layers.find(l => l.id === layerId);
    if (layer?.locked) {
      context.showMessage("Current layer is locked. Cannot create dimension.");
      this.reset(context);
      context.showMessage("[DimAngular] Select first line");
      return TOOL_RESULT_NONE;
    }

    const entity: DimensionEntity = {
      type: "dimension",
      id: `dim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      dimensionType: "angular",
      layerId,
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        firstLineId: this.firstLine.id,
        secondLineId: this.secondLine.id,
        vertex,
        firstPoint: chooseDirectionPoint(this.firstLine, vertex),
        secondPoint: chooseDirectionPoint(this.secondLine, vertex),
        arcPoint
      }
    };

    context.executeCommand(new CreateEntityCommand(entity));
    this.reset(context);
    context.showMessage("[DimAngular] Select first line");

    return TOOL_RESULT_NONE;
  }

  onPointerMove(event: ToolPointerEvent, context: ToolContext): ToolResult {
    if (!this.firstLine || !this.secondLine) {
      return TOOL_RESULT_NONE;
    }

    const arcPoint = resolveSnappedPoint(event, context);
    const vertex = intersectInfiniteLines(this.firstLine.start, this.firstLine.end, this.secondLine.start, this.secondLine.end);
    if (!vertex) return TOOL_RESULT_NONE;

    const previewEntity: DimensionEntity = {
      type: "dimension",
      id: "preview_dim",
      dimensionType: "angular",
      layerId: context.document.activeLayerId || "layer_0",
      dimensionStyleId: context.document.activeDimensionStyleId || "dimstyle_standard",
      definition: {
        firstLineId: this.firstLine.id,
        secondLineId: this.secondLine.id,
        vertex,
        firstPoint: chooseDirectionPoint(this.firstLine, vertex),
        secondPoint: chooseDirectionPoint(this.secondLine, vertex),
        arcPoint
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
      context.showMessage("[DimAngular] Select first line");
      return { type: "cancel" };
    }
    return TOOL_RESULT_NONE;
  }

  onCommandInput(): ToolResult {
    return TOOL_RESULT_NONE;
  }

  private reset(context: ToolContext): void {
    this.firstLine = null;
    this.secondLine = null;
    context.clearPreview();
  }
}

function chooseDirectionPoint(line: LineEntity, vertex: Point2D): Point2D {
  const startDistance = Math.hypot(line.start.x - vertex.x, line.start.y - vertex.y);
  const endDistance = Math.hypot(line.end.x - vertex.x, line.end.y - vertex.y);

  return endDistance >= startDistance ? line.end : line.start;
}
