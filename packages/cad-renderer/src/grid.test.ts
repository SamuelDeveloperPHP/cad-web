import { describe, expect, it } from "vitest";
import { computeAdaptiveGrid, createViewport } from "./index";

describe("cad-renderer adaptive grid", () => {
  it("computes visible grid lines for the viewport", () => {
    const grid = computeAdaptiveGrid(createViewport({ x: 0, y: 0 }, 10), {
      width: 100,
      height: 100
    });

    expect(grid.minorStep).toBe(5);
    expect(grid.majorStep).toBe(25);
    expect(grid.lines.length).toBeGreaterThan(0);
  });

  it("marks major lines at the configured interval", () => {
    const grid = computeAdaptiveGrid(createViewport({ x: -10, y: -10 }, 10), {
      width: 200,
      height: 200
    });

    expect(grid.lines.some((line) => line.major && line.worldCoordinate === 0)).toBe(true);
  });
});
