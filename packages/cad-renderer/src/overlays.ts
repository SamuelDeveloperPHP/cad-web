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

// A função desenha a mira que acompanha o cursor: linhas tracejadas amarelas de 1px cobrindo toda a área.
export function renderCursorGuides2D(
  context: CanvasRenderingContext2D,
  cursor: Point2D,
  screenSize: ScreenSize
): void {
  context.save();
  context.strokeStyle = "#eab308";
  context.lineWidth = 1;
  context.setLineDash([4, 4]);

  context.beginPath();
  // A linha vertical e a horizontal cruzam exatamente na posição do cursor.
  context.moveTo(cursor.x, 0);
  context.lineTo(cursor.x, screenSize.height);
  context.moveTo(0, cursor.y);
  context.lineTo(screenSize.width, cursor.y);
  context.stroke();

  context.restore();
}

// A função desenha os eixos do desenho na origem: uma linha verde no eixo Y (mundo x=0) e uma vermelha no eixo X (mundo y=0).
export function renderAxisLines2D(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  screenSize: ScreenSize
): void {
  const origin = worldToScreen({ x: 0, y: 0 }, viewport);

  context.save();
  context.lineWidth = 1;
  context.setLineDash([]);

  // Eixo Y (linha vertical, verde): só é desenhado quando a origem cruza a faixa visível horizontal.
  if (origin.x >= 0 && origin.x <= screenSize.width) {
    context.strokeStyle = "#22c55e";
    context.beginPath();
    context.moveTo(origin.x, 0);
    context.lineTo(origin.x, screenSize.height);
    context.stroke();
  }

  // Eixo X (linha horizontal, vermelha): só é desenhado quando a origem cruza a faixa visível vertical.
  if (origin.y >= 0 && origin.y <= screenSize.height) {
    context.strokeStyle = "#ef4444";
    context.beginPath();
    context.moveTo(0, origin.y);
    context.lineTo(screenSize.width, origin.y);
    context.stroke();
  }

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
  } else if (snapType === "insertion") {
    // Inserção: dois quadrados sobrepostos deslocados (convenção do AutoCAD).
    const half = radius * 0.7;
    context.strokeRect(point.x - radius, point.y - radius, half * 2, half * 2);
    context.strokeRect(point.x - radius + half * 0.6, point.y - radius + half * 0.6, half * 2, half * 2);
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
  } else if (snapType === "quadrant") {
    // O quadrante usa um losango (quadrado a 45°), convenção do AutoCAD.
    context.beginPath();
    context.moveTo(point.x, point.y - radius);
    context.lineTo(point.x + radius, point.y);
    context.lineTo(point.x, point.y + radius);
    context.lineTo(point.x - radius, point.y);
    context.closePath();
    context.stroke();
  } else if (snapType === "intersection") {
    // A interseção usa um "X", convenção do AutoCAD.
    context.beginPath();
    context.moveTo(point.x - radius, point.y - radius);
    context.lineTo(point.x + radius, point.y + radius);
    context.moveTo(point.x + radius, point.y - radius);
    context.lineTo(point.x - radius, point.y + radius);
    context.stroke();
  } else if (snapType === "perpendicular") {
    // Perpendicular: símbolo de ângulo reto (convenção do AutoCAD).
    context.beginPath();
    context.moveTo(point.x - radius, point.y - radius);
    context.lineTo(point.x - radius, point.y + radius);
    context.lineTo(point.x + radius, point.y + radius);
    context.moveTo(point.x - radius, point.y);
    context.lineTo(point.x, point.y);
    context.lineTo(point.x, point.y + radius);
    context.stroke();
  } else if (snapType === "tangent") {
    // Tangente: círculo com uma reta tangente no topo (convenção do AutoCAD).
    context.beginPath();
    context.arc(point.x, point.y + radius * 0.35, radius * 0.65, 0, Math.PI * 2);
    context.moveTo(point.x - radius, point.y - radius * 0.5);
    context.lineTo(point.x + radius, point.y - radius * 0.5);
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

export function renderAngleArc2D(
  context: CanvasRenderingContext2D,
  from: Point2D,
  to: Point2D,
  viewport: Viewport,
  options: Readonly<{ arcRadius?: number; showLabel?: boolean }> = {}
): void {
  const screenFrom = worldToScreen(from, viewport);
  const screenTo = worldToScreen(to, viewport);
  const dx = screenTo.x - screenFrom.x;
  const dy = screenTo.y - screenFrom.y;
  const dist = Math.hypot(dx, dy);

  if (dist < 4) {
    return;
  }

  const angle = Math.atan2(dy, dx);
  const arcRadius = Math.min(options.arcRadius ?? 40, dist * 0.6);
  const startAngle = 0;
  const endAngle = angle;
  const showLabel = options.showLabel !== false;

  context.save();
  context.strokeStyle = "#94a3b8";
  context.lineWidth = 1;
  context.setLineDash([3, 3]);

  context.beginPath();
  if (endAngle >= 0) {
    context.arc(screenFrom.x, screenFrom.y, arcRadius, startAngle, endAngle);
  } else {
    context.arc(screenFrom.x, screenFrom.y, arcRadius, endAngle, startAngle);
  }
  context.stroke();

  context.setLineDash([]);
  context.beginPath();
  context.moveTo(screenFrom.x, screenFrom.y);
  context.lineTo(screenFrom.x + arcRadius + 8, screenFrom.y);
  context.strokeStyle = "#64748b";
  context.lineWidth = 0.5;
  context.stroke();

  if (showLabel) {
    // O rótulo usa a convenção visual do AutoCAD (0° = Leste, 90° = Norte/cima, anti-horário).
    // Como o Y da tela cresce para baixo, o sinal do ângulo de tela é invertido para exibição.
    let degrees = (-angle * 180) / Math.PI;
    if (degrees < 0) {
      degrees += 360;
    }
    const labelAngle = angle / 2;
    const labelRadius = arcRadius + 14;
    const labelX = screenFrom.x + Math.cos(labelAngle) * labelRadius;
    const labelY = screenFrom.y + Math.sin(labelAngle) * labelRadius;

    context.font = "11px Inter, ui-sans-serif, system-ui, sans-serif";
    context.fillStyle = "#94a3b8";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(`${degrees.toFixed(1)}°`, labelX, labelY);
  }

  context.restore();
}

function getSnapLabel(snapType: SnapType): string {
  if (snapType === "endpoint") {
    return "Endpoint";
  }

  if (snapType === "insertion") {
    return "Insertion";
  }

  if (snapType === "midpoint") {
    return "Midpoint";
  }

  if (snapType === "center") {
    return "Center";
  }

  if (snapType === "quadrant") {
    return "Quadrant";
  }

  if (snapType === "intersection") {
    return "Intersection";
  }

  if (snapType === "perpendicular") {
    return "Perpendicular";
  }

  if (snapType === "tangent") {
    return "Tangent";
  }

  return "Nearest";
}
