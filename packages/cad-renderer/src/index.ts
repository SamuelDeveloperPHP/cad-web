import type { CadDocument } from "@cad-web/cad-core";
import type { Point2D } from "@cad-web/cad-geometry";

export type Viewport2D = Readonly<{
  origin: Point2D;
  scale: number;
}>;

export function worldToScreen(point: Point2D, viewport: Viewport2D): Point2D {
  return {
    x: (point.x - viewport.origin.x) * viewport.scale,
    y: (point.y - viewport.origin.y) * viewport.scale
  };
}

export function renderDocument2D(
  context: CanvasRenderingContext2D,
  document: CadDocument,
  viewport: Viewport2D
): void {
  context.save();

  for (const entity of document.entities) {
    if (entity.type !== "line") {
      continue;
    }

    const start = worldToScreen(entity.start, viewport);
    const end = worldToScreen(entity.end, viewport);

    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.restore();
}
