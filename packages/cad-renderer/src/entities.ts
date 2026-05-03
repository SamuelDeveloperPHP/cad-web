import type { CadDocument } from "@cad-web/cad-core";
import { rotationMatrix, transformPoint, type Point2D } from "@cad-web/cad-geometry";
import { worldToScreen } from "./viewport";
import { DEFAULT_RENDER_STYLE, type RenderStyle, type Viewport } from "./types";

export function renderDocument2D(
  context: CanvasRenderingContext2D,
  document: CadDocument,
  viewport: Viewport,
  style: RenderStyle = DEFAULT_RENDER_STYLE
): void {
  context.save();
  applyStrokeStyle(context, style);

  for (const entity of document.entities) {
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
    }
  }

  context.restore();
}

function applyStrokeStyle(context: CanvasRenderingContext2D, style: RenderStyle): void {
  context.strokeStyle = style.strokeColor;
  context.lineWidth = style.lineWidth;
}
