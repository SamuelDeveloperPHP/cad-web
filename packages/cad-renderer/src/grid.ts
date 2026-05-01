import { screenToWorld } from "./viewport";
import type { AdaptiveGrid, GridLine, ScreenSize, Viewport } from "./types";

const TARGET_MINOR_GRID_PIXELS = 40;
const MAJOR_LINE_INTERVAL = 5;

export function computeAdaptiveGrid(viewport: Viewport, screenSize: ScreenSize): AdaptiveGrid {
  const minorStep = computeGridStep(viewport.scale);
  const majorStep = minorStep * MAJOR_LINE_INTERVAL;
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToWorld({ x: screenSize.width, y: screenSize.height }, viewport);
  const lines: GridLine[] = [];

  for (const x of iterateGridCoordinates(topLeft.x, bottomRight.x, minorStep)) {
    lines.push({
      orientation: "vertical",
      worldCoordinate: x,
      major: isMajorCoordinate(x, majorStep)
    });
  }

  for (const y of iterateGridCoordinates(topLeft.y, bottomRight.y, minorStep)) {
    lines.push({
      orientation: "horizontal",
      worldCoordinate: y,
      major: isMajorCoordinate(y, majorStep)
    });
  }

  return {
    minorStep,
    majorStep,
    lines
  };
}

export function renderGrid2D(
  context: CanvasRenderingContext2D,
  viewport: Viewport,
  screenSize: ScreenSize,
  grid: AdaptiveGrid = computeAdaptiveGrid(viewport, screenSize)
): void {
  context.save();

  for (const line of grid.lines) {
    context.beginPath();
    context.strokeStyle = line.major ? "#475569" : "#1f2937";
    context.lineWidth = line.major ? 1 : 0.5;

    if (line.orientation === "vertical") {
      const x = (line.worldCoordinate - viewport.origin.x) * viewport.scale;
      context.moveTo(x, 0);
      context.lineTo(x, screenSize.height);
    } else {
      const y = (line.worldCoordinate - viewport.origin.y) * viewport.scale;
      context.moveTo(0, y);
      context.lineTo(screenSize.width, y);
    }

    context.stroke();
  }

  context.restore();
}

function computeGridStep(scale: number): number {
  const rawStep = TARGET_MINOR_GRID_PIXELS / scale;
  const exponent = Math.floor(Math.log10(rawStep));
  const base = 10 ** exponent;
  const normalized = rawStep / base;

  if (normalized <= 1) {
    return base;
  }

  if (normalized <= 2) {
    return 2 * base;
  }

  if (normalized <= 5) {
    return 5 * base;
  }

  return 10 * base;
}

function iterateGridCoordinates(start: number, end: number, step: number): ReadonlyArray<number> {
  const coordinates: number[] = [];
  const first = Math.floor(Math.min(start, end) / step) * step;
  const last = Math.ceil(Math.max(start, end) / step) * step;

  for (let coordinate = first; coordinate <= last; coordinate += step) {
    coordinates.push(normalizeCoordinate(coordinate));
  }

  return coordinates;
}

function isMajorCoordinate(coordinate: number, majorStep: number): boolean {
  return Math.abs(coordinate / majorStep - Math.round(coordinate / majorStep)) < 1e-9;
}

function normalizeCoordinate(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : Number(value.toPrecision(12));
}
