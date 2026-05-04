import { getDocumentSpatialIndex, type CadDocument } from "@cad-web/cad-core";
import { rotationMatrix, transformPoint, buildLinearDimensionGeometry, buildAlignedDimensionGeometry, type Point2D } from "@cad-web/cad-geometry";
import { screenToWorld, worldToScreen } from "./viewport";
import { DEFAULT_RENDER_STYLE, type RenderStyle, type Viewport } from "./types";

export type RenderStats = {
  visibleEntities: number;
  renderedEntities: number;
  totalEntities: number;
  indexQueryTimeMs: number;
  renderTimeMs: number;
};

export function renderDocument2D(
  context: CanvasRenderingContext2D,
  document: CadDocument,
  viewport: Viewport,
  style: RenderStyle = DEFAULT_RENDER_STYLE
): RenderStats {
  const renderStartTime = performance.now();
  context.save();
  applyStrokeStyle(context, style);

  const canvasWidth = context.canvas.width;
  const canvasHeight = context.canvas.height;
  
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToWorld({ x: canvasWidth, y: canvasHeight }, viewport);
  
  const viewportBounds = {
    minX: topLeft.x,
    minY: topLeft.y,
    maxX: bottomRight.x,
    maxY: bottomRight.y
  };

  const indexStartTime = performance.now();
  const spatialIndex = getDocumentSpatialIndex(document);
  const visibleEntities = spatialIndex.query(viewportBounds);
  const indexQueryTimeMs = performance.now() - indexStartTime;
  let renderedEntities = 0;

  const layerMap = new Map(document.layers.map(l => [l.id, l]));

  for (const entity of visibleEntities) {
    const layer = layerMap.get(entity.layerId || "layer_0");
    if (layer && !layer.visible) continue;

    context.strokeStyle = entity.color || layer?.color || style.strokeColor;
    context.lineWidth = entity.lineThickness !== undefined ? entity.lineThickness : style.lineWidth;
    
    if (entity.lineType === "dashed") {
      context.setLineDash([8, 6]);
    } else if (entity.lineType === "dotted") {
      context.setLineDash([2, 4]);
    } else {
      context.setLineDash([]);
    }
    if (entity.type === "line") {
      const start = worldToScreen(entity.start, viewport);
      const end = worldToScreen(entity.end, viewport);

      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
    } else if (entity.type === "rectangle") {
      let p1: Point2D = { x: entity.x, y: entity.y };
      let p2: Point2D = { x: entity.x + entity.width, y: entity.y };
      let p3: Point2D = { x: entity.x + entity.width, y: entity.y + entity.height };
      let p4: Point2D = { x: entity.x, y: entity.y + entity.height };

      if (entity.rotation) {
        const matrix = rotationMatrix(entity.rotation, p1);
        p1 = transformPoint(p1, matrix);
        p2 = transformPoint(p2, matrix);
        p3 = transformPoint(p3, matrix);
        p4 = transformPoint(p4, matrix);
      }

      const sp1 = worldToScreen(p1, viewport);
      const sp2 = worldToScreen(p2, viewport);
      const sp3 = worldToScreen(p3, viewport);
      const sp4 = worldToScreen(p4, viewport);

      context.beginPath();
      context.moveTo(sp1.x, sp1.y);
      context.lineTo(sp2.x, sp2.y);
      context.lineTo(sp3.x, sp3.y);
      context.lineTo(sp4.x, sp4.y);
      context.closePath();
      context.stroke();
    } else if (entity.type === "circle") {
      const center = worldToScreen(entity.center, viewport);
      const radiusScreen = entity.radius * viewport.scale;

      context.beginPath();
      context.arc(center.x, center.y, radiusScreen, 0, Math.PI * 2);
      context.stroke();
    } else if (entity.type === "dimension") {
      const defaultStyle = {
        textHeight: entity.style?.textHeight ?? 12,
        arrowSize: entity.style?.arrowSize ?? 6,
        extensionOffset: entity.style?.extensionOffset ?? 2,
        extensionOvershoot: entity.style?.extensionOvershoot ?? 3,
        precision: entity.style?.precision ?? 2,
        unitSuffix: entity.style?.unitSuffix ?? " mm",
        arrowType: entity.style?.arrowType ?? "tick",
      };

      const geom = entity.dimensionType === "linear" 
        ? buildLinearDimensionGeometry(entity.definition as any, defaultStyle, document.units, document.displayUnit || document.units)
        : buildAlignedDimensionGeometry(entity.definition as any, defaultStyle, document.units, document.displayUnit || document.units);

      // Draw extension lines
      const ext1Start = worldToScreen(geom.extensionLine1.start, viewport);
      const ext1End = worldToScreen(geom.extensionLine1.end, viewport);
      const ext2Start = worldToScreen(geom.extensionLine2.start, viewport);
      const ext2End = worldToScreen(geom.extensionLine2.end, viewport);

      context.beginPath();
      context.moveTo(ext1Start.x, ext1Start.y);
      context.lineTo(ext1End.x, ext1End.y);
      context.moveTo(ext2Start.x, ext2Start.y);
      context.lineTo(ext2End.x, ext2End.y);
      context.stroke();

      // Draw dimension line
      const dimStart = worldToScreen(geom.dimensionLine.start, viewport);
      const dimEnd = worldToScreen(geom.dimensionLine.end, viewport);
      
      context.beginPath();
      context.moveTo(dimStart.x, dimStart.y);
      context.lineTo(dimEnd.x, dimEnd.y);
      context.stroke();

      const tickSizeScreen = defaultStyle.arrowSize * viewport.scale;

      if (defaultStyle.arrowType === "arrow") {
        // Draw filled arrows
        const drawArrow = (point: {x:number, y:number}, opposite: {x:number, y:number}) => {
          const dirX = opposite.x - point.x;
          const dirY = opposite.y - point.y;
          const len = Math.hypot(dirX, dirY);
          if (len === 0) return;
          const nx = dirX / len;
          const ny = dirY / len;
          
          const arrowLen = tickSizeScreen;
          const arrowWidth = tickSizeScreen * 0.3;
          
          context.beginPath();
          context.moveTo(point.x, point.y);
          context.lineTo(point.x + nx * arrowLen - ny * arrowWidth, point.y + ny * arrowLen + nx * arrowWidth);
          context.lineTo(point.x + nx * arrowLen + ny * arrowWidth, point.y + ny * arrowLen - nx * arrowWidth);
          context.closePath();
          context.fillStyle = context.strokeStyle;
          context.fill();
        };

        drawArrow(dimStart, dimEnd);
        drawArrow(dimEnd, dimStart);
      } else {
        // Draw Architectural Ticks (45 degree lines at the ends)
        const tickDx = tickSizeScreen * 0.5;
        const tickDy = tickSizeScreen * 0.5;

        context.beginPath();
        context.moveTo(dimStart.x - tickDx, dimStart.y + tickDy);
        context.lineTo(dimStart.x + tickDx, dimStart.y - tickDy);
        context.moveTo(dimEnd.x - tickDx, dimEnd.y + tickDy);
        context.lineTo(dimEnd.x + tickDx, dimEnd.y - tickDy);
        // Ticks are usually drawn slightly thicker
        const oldLineWidth = context.lineWidth;
        context.lineWidth = oldLineWidth * 1.5;
        context.stroke();
        context.lineWidth = oldLineWidth;
      }

      // Draw Text
      const textPos = worldToScreen(geom.textPosition, viewport);
      const textVal = entity.textOverride || geom.formattedText;
      const fontSizeScreen = defaultStyle.textHeight * viewport.scale;

      context.save();
      context.translate(textPos.x, textPos.y);
      context.rotate(geom.textRotation);

      context.font = `${fontSizeScreen}px Arial, sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";

      // Draw whiteout (background) more discreetly
      const textMetrics = context.measureText(textVal);
      const textWidth = textMetrics.width;
      const padding = fontSizeScreen * 0.1; // Reduced padding
      
      context.fillStyle = "rgba(17, 19, 21, 0.85)"; // Reduced opacity, dark bg
      context.fillRect(-textWidth/2 - padding, -fontSizeScreen/2 - padding, textWidth + padding*2, fontSizeScreen + padding*2);

      context.fillStyle = context.strokeStyle;
      context.fillText(textVal, 0, 0);

      context.restore();
    }
    renderedEntities += 1;
  }

  context.restore();

  return {
    visibleEntities: visibleEntities.length,
    renderedEntities,
    totalEntities: document.entities.length,
    indexQueryTimeMs,
    renderTimeMs: performance.now() - renderStartTime
  };
}

function applyStrokeStyle(context: CanvasRenderingContext2D, style: RenderStyle): void {
  context.strokeStyle = style.strokeColor;
  context.lineWidth = style.lineWidth;
}
