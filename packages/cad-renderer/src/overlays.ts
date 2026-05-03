import type { Point2D, SnapType } from "@cad-web/cad-geometry";
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

export function renderSnapMarker2D(
  context: CanvasRenderingContext2D,
  point: Point2D,
  snapType: SnapType = "endpoint",
  radius = 6
): void {
  context.save();
  context.strokeStyle = "#f59e0b";
  context.fillStyle = "#fbbf24";
  context.lineWidth = 1.5;

  if (snapType === "endpoint") {
    context.strokeRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
  } else if (snapType === "midpoint") {
    context.beginPath();
    context.moveTo(point.x, point.y - radius);
    context.lineTo(point.x + radius, point.y + radius);
    context.lineTo(point.x - radius, point.y + radius);
    context.closePath();
    context.stroke();
  } else if (snapType === "center") {
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.beginPath();
    context.moveTo(point.x, point.y - radius);
    context.lineTo(point.x + radius, point.y);
    context.lineTo(point.x, point.y + radius);
    context.lineTo(point.x - radius, point.y);
    context.closePath();
    context.stroke();
    context.beginPath();
    context.moveTo(point.x - radius * 0.55, point.y - radius * 0.55);
    context.lineTo(point.x + radius * 0.55, point.y + radius * 0.55);
    context.moveTo(point.x + radius * 0.55, point.y - radius * 0.55);
    context.lineTo(point.x - radius * 0.55, point.y + radius * 0.55);
    context.stroke();
  }

  context.font = "11px Inter, ui-sans-serif, system-ui, sans-serif";
  context.fillText(getSnapLabel(snapType), point.x + radius + 6, point.y - radius - 4);
  context.restore();
}

function getSnapLabel(snapType: SnapType): string {
  if (snapType === "endpoint") {
    return "Endpoint";
  }

  if (snapType === "midpoint") {
    return "Midpoint";
  }

  if (snapType === "center") {
    return "Center";
  }

  return "Nearest";
}
