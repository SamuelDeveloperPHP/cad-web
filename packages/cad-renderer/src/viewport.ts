import type { BoundingBox, Point2D } from "@cad-web/cad-geometry";
import type { ScreenSize, Viewport, ZoomExtentsOptions } from "./types";

export const MIN_VIEWPORT_SCALE = 1e-6;
export const MAX_VIEWPORT_SCALE = 1e9;

export function createViewport(origin: Point2D = { x: 0, y: 0 }, scale = 1): Viewport {
  return {
    origin,
    scale: clampScale(scale)
  };
}

export function worldToScreen(point: Point2D, viewport: Viewport): Point2D {
  return {
    x: (point.x - viewport.origin.x) * viewport.scale,
    y: (point.y - viewport.origin.y) * viewport.scale
  };
}

export function screenToWorld(point: Point2D, viewport: Viewport): Point2D {
  return {
    x: point.x / viewport.scale + viewport.origin.x,
    y: point.y / viewport.scale + viewport.origin.y
  };
}

export function panViewport(viewport: Viewport, deltaScreen: Point2D): Viewport {
  return {
    origin: {
      x: viewport.origin.x - deltaScreen.x / viewport.scale,
      y: viewport.origin.y - deltaScreen.y / viewport.scale
    },
    scale: viewport.scale
  };
}

export function zoomViewportAtScreenPoint(
  viewport: Viewport,
  screenPoint: Point2D,
  zoomFactor: number
): Viewport {
  const worldBeforeZoom = screenToWorld(screenPoint, viewport);
  const nextScale = clampScale(viewport.scale * zoomFactor);

  return {
    origin: {
      x: worldBeforeZoom.x - screenPoint.x / nextScale,
      y: worldBeforeZoom.y - screenPoint.y / nextScale
    },
    scale: nextScale
  };
}

export function zoomExtents(options: ZoomExtentsOptions): Viewport {
  const drawableWidth = Math.max(1, options.screenSize.width - options.paddingPixels * 2);
  const drawableHeight = Math.max(1, options.screenSize.height - options.paddingPixels * 2);
  const boundsWidth = Math.max(1e-9, options.bounds.maxX - options.bounds.minX);
  const boundsHeight = Math.max(1e-9, options.bounds.maxY - options.bounds.minY);
  const scale = clampScale(Math.min(drawableWidth / boundsWidth, drawableHeight / boundsHeight));
  const worldCenter = getBoundingBoxCenter(options.bounds);
  const screenCenter = {
    x: options.screenSize.width / 2,
    y: options.screenSize.height / 2
  };

  return {
    origin: {
      x: worldCenter.x - screenCenter.x / scale,
      y: worldCenter.y - screenCenter.y / scale
    },
    scale
  };
}

function getBoundingBoxCenter(bounds: BoundingBox): Point2D {
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  };
}

function clampScale(scale: number): number {
  return Math.min(Math.max(scale, MIN_VIEWPORT_SCALE), MAX_VIEWPORT_SCALE);
}
