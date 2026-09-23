import { describe, expect, it } from "vitest";
import { ellipsePointAtParam } from "./ellipse";
import { rotationMatrix, scaleMatrix, multiplyMatrices } from "./matrix";
import { affineEllipse, flattenCubicBezier, linearPartTimesRotationScale, svgArcToCenter } from "./svgGeometry";

describe("svg arc endpoint → center conversion", () => {
  it("recovers a quarter circle", () => {
    const arc = svgArcToCenter({ x: 10, y: 0 }, { x: 0, y: 10 }, 10, 10, 0, false, true);

    expect(arc?.center.x).toBeCloseTo(0);
    expect(arc?.center.y).toBeCloseTo(0);
    expect(arc?.startParam).toBeCloseTo(0);
    expect(arc?.deltaParam).toBeCloseTo(Math.PI / 2);
  });

  it("takes the large arc with negative sweep when asked", () => {
    const arc = svgArcToCenter({ x: 10, y: 0 }, { x: 0, y: 10 }, 10, 10, 0, true, false);

    expect(arc?.center.x).toBeCloseTo(0);
    expect(arc?.deltaParam).toBeCloseTo(-3 * Math.PI / 2);
  });

  it("scales up radii that are too small and reproduces the end point on rotated ellipses", () => {
    const small = svgArcToCenter({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 1, 0, false, true);
    expect(small?.radiusX).toBeCloseTo(5);

    const rotated = svgArcToCenter({ x: 3, y: 4 }, { x: -7, y: 2 }, 12, 6, 25, true, true)!;
    const end = ellipsePointAtParam(rotated.center, rotated.radiusX, rotated.radiusY, rotated.rotation, rotated.startParam + rotated.deltaParam);
    expect(end.x).toBeCloseTo(-7, 9);
    expect(end.y).toBeCloseTo(2, 9);
  });

  it("returns null for degenerate arcs", () => {
    expect(svgArcToCenter({ x: 1, y: 1 }, { x: 1, y: 1 }, 5, 5, 0, false, true)).toBeNull();
    expect(svgArcToCenter({ x: 0, y: 0 }, { x: 1, y: 1 }, 0, 5, 0, false, true)).toBeNull();
  });
});

describe("affine image of an ellipse", () => {
  it("rotates and scales an axis-aligned ellipse", () => {
    const matrix = multiplyMatrices(rotationMatrix(Math.PI / 6), scaleMatrix(2));
    const image = affineEllipse({ x: 0, y: 0 }, linearPartTimesRotationScale(matrix, 0, 20, 10));

    expect(image.radiusX).toBeCloseTo(40);
    expect(image.radiusY).toBeCloseTo(20);
    expect(Math.cos(2 * (image.rotation - Math.PI / 6))).toBeCloseTo(1);
  });

  it("turns a circle under non-uniform scale into an ellipse", () => {
    const image = affineEllipse({ x: 0, y: 0 }, linearPartTimesRotationScale(scaleMatrix(1, 3), 0, 5, 5));

    expect(image.radiusX).toBeCloseTo(15);
    expect(image.radiusY).toBeCloseTo(5);
    expect(Math.abs(Math.sin(image.rotation))).toBeCloseTo(1);
  });

  it("keeps the axes under a reflection", () => {
    const image = affineEllipse({ x: 0, y: 0 }, linearPartTimesRotationScale(scaleMatrix(1, -1), 0.3, 8, 4));

    expect(image.radiusX).toBeCloseTo(8);
    expect(image.radiusY).toBeCloseTo(4);
    expect(Math.cos(2 * (image.rotation + 0.3))).toBeCloseTo(1);
  });
});

describe("bezier flattening", () => {
  it("ends exactly at the last control point", () => {
    const points = flattenCubicBezier({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }, 8);

    expect(points).toHaveLength(8);
    expect(points.at(-1)).toEqual({ x: 10, y: 0 });
    expect(points[3]?.y).toBeGreaterThan(7);
  });
});
