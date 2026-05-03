import { describe, expect, it } from "vitest";
import {
  DEFAULT_SNAP_SETTINGS,
  findBestSnap,
  type SnapEntity,
  type SnapSettings,
  type SnapViewport
} from "./index";

const viewport: SnapViewport = {
  origin: { x: 0, y: 0 },
  scale: 10
};

const defaultSettings: SnapSettings = {
  ...DEFAULT_SNAP_SETTINGS,
  tolerancePx: 12
};

describe("cad-geometry object snap", () => {
  it("finds endpoint snap on a line", () => {
    const result = findBestSnap(
      { x: 0.4, y: 0.2 },
      { x: 4, y: 2 },
      [createLine()],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 0, y: 0 });
    expect(result.candidate?.type).toBe("endpoint");
  });

  it("finds midpoint snap on a line", () => {
    const result = findBestSnap(
      { x: 5, y: 0.3 },
      { x: 50, y: 3 },
      [createLine()],
      { ...defaultSettings, endpoint: false },
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 5, y: 0 });
    expect(result.candidate?.type).toBe("midpoint");
  });

  it("finds center snap on a circle", () => {
    const result = findBestSnap(
      { x: 20.2, y: 9.8 },
      { x: 202, y: 98 },
      [{ id: "circle_001", type: "circle", center: { x: 20, y: 10 }, radius: 5 }],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 20, y: 10 });
    expect(result.candidate?.type).toBe("center");
  });

  it("finds center snap on a rectangle", () => {
    const result = findBestSnap(
      { x: 5.4, y: 2.6 },
      { x: 54, y: 26 },
      [{ id: "rect_001", type: "rectangle", x: 0, y: 0, width: 10, height: 5 }],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 5, y: 2.5 });
    expect(result.candidate?.type).toBe("center");
  });

  it("finds nearest snap on a line", () => {
    const result = findBestSnap(
      { x: 6, y: 0.6 },
      { x: 60, y: 6 },
      [createLine()],
      { ...defaultSettings, endpoint: false, midpoint: false, center: false },
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 6, y: 0 });
    expect(result.candidate?.type).toBe("nearest");
  });

  it("prioritizes endpoint over a closer nearest candidate", () => {
    const result = findBestSnap(
      { x: 0.5, y: 0.2 },
      { x: 5, y: 2 },
      [createLine()],
      defaultSettings,
      viewport
    );

    expect(result.snapped).toBe(true);
    expect(result.point).toEqual({ x: 0, y: 0 });
    expect(result.candidate?.type).toBe("endpoint");
  });

  it("returns raw point when snap is disabled", () => {
    const rawPoint = { x: 0.4, y: 0.2 };
    const result = findBestSnap(
      rawPoint,
      { x: 4, y: 2 },
      [createLine()],
      { ...defaultSettings, enabled: false },
      viewport
    );

    expect(result).toEqual({
      snapped: false,
      point: rawPoint,
      rawPoint
    });
  });
});

function createLine(): SnapEntity {
  return {
    id: "line_001",
    type: "line",
    start: { x: 0, y: 0 },
    end: { x: 10, y: 0 }
  };
}
