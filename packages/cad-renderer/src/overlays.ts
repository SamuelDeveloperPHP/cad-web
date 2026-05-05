import { getDimensionGripPoints, type Point2D, type SnapType } from "@cad-web/cad-geometry";
import { resolveDimensionStyle, type CadDocument, type DimensionEntity, type EntityId } from "@cad-web/cad-core";
import type { Viewport } from "./types";
import { worldToScreen } from "./viewport";
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

export type DimensionGripOverlayOptions = Readonly<{
  sizePx?: number;
  hoveredGripId?: string | null;
}>;

export function renderDimensionGrips2D(
  context: CanvasRenderingContext2D,
  document: CadDocument,
  selectedEntityIds: ReadonlyArray<EntityId>,
  viewport: Viewport,
  options: DimensionGripOverlayOptions = {}
): void {
  if (selectedEntityIds.length !== 1) {
    return;
  }

  const entity = document.entities.find((candidate) => candidate.id === selectedEntityIds[0]);

  if (entity?.type !== "dimension") {
    return;
  }

  const layer = document.layers.find((candidate) => candidate.id === entity.layerId);

  if (layer?.visible === false || layer?.locked === true) {
    return;
  }

  const size = options.sizePx ?? 8;
  const half = size / 2;
  const grips = getDimensionGripPoints(entity as any, resolveDimensionStyle(document, entity as DimensionEntity));

  context.save();
  context.setLineDash([]);
  context.lineWidth = 1.25;

  for (const grip of grips) {
    const screenPoint = worldToScreen(grip.point, viewport);
    const isHovered = grip.id === options.hoveredGripId;

    context.fillStyle = isHovered ? "#38bdf8" : "#0f172a";
    context.strokeStyle = isHovered ? "#e0f2fe" : "#60a5fa";
    context.fillRect(screenPoint.x - half, screenPoint.y - half, size, size);
    context.strokeRect(screenPoint.x - half, screenPoint.y - half, size, size);
  }

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
