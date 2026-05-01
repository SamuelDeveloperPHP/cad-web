import type { CadDocument } from "@cad-web/cad-core";
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
    }
  }

  context.restore();
}

function applyStrokeStyle(context: CanvasRenderingContext2D, style: RenderStyle): void {
  context.strokeStyle = style.strokeColor;
  context.lineWidth = style.lineWidth;
}
