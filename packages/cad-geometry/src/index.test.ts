import { describe, expect, it } from "vitest";
import { distance, nearlyEqual, pointsNearlyEqual } from "./index";

describe("cad-geometry", () => {
  it("compares floating point values with tolerance", () => {
    expect(nearlyEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(nearlyEqual(0.1, 0.2)).toBe(false);
  });

  it("compares points with tolerance", () => {
    expect(
      pointsNearlyEqual(
        { x: 10, y: 20 },
        { x: 10 + 1e-10, y: 20 - 1e-10 }
      )
    ).toBe(true);
  });

  it("calculates euclidean distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});
