import type { Point2D } from "@cad-web/cad-geometry";
import type { ScreenSize } from "./types";

export function renderCrosshair2D(
  context: CanvasRenderingContext2D,
  cursor: Point2D,
  screenSize: ScreenSize
): void {
  context.save();
  context.strokeStyle = "#94a3b8";
  context.lineWidth = 1;
  context.setLineDash([4, 4]);

  context.beginPath();
  context.moveTo(cursor.x, 0);
  context.lineTo(cursor.x, screenSize.height);
  context.moveTo(0, cursor.y);
  context.lineTo(screenSize.width, cursor.y);
  context.stroke();

  context.restore();
}

export function renderSnapMarker2D(context: CanvasRenderingContext2D, point: Point2D, radius = 5): void {
  context.save();
  context.strokeStyle = "#f59e0b";
  context.lineWidth = 1;
  context.strokeRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  context.restore();
}
