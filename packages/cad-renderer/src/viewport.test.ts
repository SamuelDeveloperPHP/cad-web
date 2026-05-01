import { describe, expect, it } from "vitest";
import {
  createViewport,
  panViewport,
  screenToWorld,
  worldToScreen,
  zoomExtents,
  zoomViewportAtScreenPoint
} from "./index";

describe("cad-renderer viewport", () => {
  it("converts world coordinates to screen coordinates and back", () => {
    const viewport = createViewport({ x: 10, y: 20 }, 2);
    const screen = worldToScreen({ x: 15, y: 30 }, viewport);

    expect(screen).toEqual({ x: 10, y: 20 });
    expect(screenToWorld(screen, viewport)).toEqual({ x: 15, y: 30 });
  });

  it("pans viewport using screen delta", () => {
    expect(panViewport(createViewport({ x: 0, y: 0 }, 2), { x: 10, y: -20 })).toEqual({
      origin: { x: -5, y: 10 },
      scale: 2
    });
  });

  it("zooms while preserving the cursor world position", () => {
    const viewport = createViewport({ x: 0, y: 0 }, 1);
    const cursor = { x: 100, y: 100 };
    const worldBefore = screenToWorld(cursor, viewport);
    const zoomed = zoomViewportAtScreenPoint(viewport, cursor, 2);
    const worldAfter = screenToWorld(cursor, zoomed);

    expect(worldAfter).toEqual(worldBefore);
    expect(zoomed.scale).toBe(2);
  });

  it("fits bounds into the screen with padding", () => {
    const viewport = zoomExtents({
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 50 },
      screenSize: { width: 1000, height: 600 },
      paddingPixels: 50
    });

    expect(viewport.scale).toBe(9);
    expect(worldToScreen({ x: 50, y: 25 }, viewport)).toEqual({ x: 500, y: 300 });
  });
});
