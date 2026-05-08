import { describe, expect, it } from "vitest";
import {
  explodePolylineToLines,
  explodeRectangleToLines,
  getRectangleCorners,
  isZeroLengthSegment,
  pointsToSegments
} from "./explode";

describe("getRectangleCorners", () => {
  it("returns four corners in clockwise visual order without rotation", () => {
    const corners = getRectangleCorners({ x: 0, y: 0, width: 10, height: 5 });

    expect(corners).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 5 }
    ]);
  });

  it("rotates corners around the base point when rotation is provided", () => {
    const corners = getRectangleCorners({ x: 0, y: 0, width: 4, height: 2, rotation: Math.PI / 2 });

    expect(corners[0]?.x).toBeCloseTo(0);
    expect(corners[0]?.y).toBeCloseTo(0);
    expect(corners[1]?.x).toBeCloseTo(0);
    expect(corners[1]?.y).toBeCloseTo(4);
  });
});

describe("explodeRectangleToLines", () => {
  it("returns 4 segments forming a closed contour", () => {
    const segments = explodeRectangleToLines({ x: 0, y: 0, width: 10, height: 5 });

    expect(segments).toHaveLength(4);
    expect(segments[0]).toMatchObject({ start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    expect(segments[1]).toMatchObject({ start: { x: 10, y: 0 }, end: { x: 10, y: 5 } });
    expect(segments[2]).toMatchObject({ start: { x: 10, y: 5 }, end: { x: 0, y: 5 } });
    expect(segments[3]).toMatchObject({ start: { x: 0, y: 5 }, end: { x: 0, y: 0 } });
  });

  it("respects rotation when generating segments", () => {
    const segments = explodeRectangleToLines({ x: 0, y: 0, width: 4, height: 2, rotation: Math.PI / 2 });

    expect(segments[0]?.start.x).toBeCloseTo(0);
    expect(segments[0]?.start.y).toBeCloseTo(0);
    expect(segments[0]?.end.x).toBeCloseTo(0);
    expect(segments[0]?.end.y).toBeCloseTo(4);
  });
});

describe("explodePolylineToLines", () => {
  it("returns N-1 segments for an open polyline", () => {
    const segments = explodePolylineToLines({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 }
      ],
      closed: false
    });

    expect(segments).toHaveLength(3);
  });

  it("returns N segments for a closed polyline closing the contour", () => {
    const segments = explodePolylineToLines({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 },
        { x: 0, y: 5 }
      ],
      closed: true
    });

    expect(segments).toHaveLength(4);
    expect(segments[3]).toMatchObject({ start: { x: 0, y: 5 }, end: { x: 0, y: 0 } });
  });

  it("ignores zero-length segments produced by duplicated points", () => {
    const segments = explodePolylineToLines({
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 }
      ],
      closed: false
    });

    expect(segments).toHaveLength(2);
  });

  it("returns no segments for fewer than two points", () => {
    expect(explodePolylineToLines({ points: [{ x: 0, y: 0 }], closed: false })).toEqual([]);
  });
});

describe("pointsToSegments", () => {
  it("matches explodePolylineToLines output for shared inputs", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 }
    ];

    expect(pointsToSegments(points, false)).toEqual(explodePolylineToLines({ points, closed: false }));
    expect(pointsToSegments(points, true)).toEqual(explodePolylineToLines({ points, closed: true }));
  });
});

describe("isZeroLengthSegment", () => {
  it("returns true for points within tolerance", () => {
    expect(isZeroLengthSegment({ x: 0, y: 0 }, { x: 0, y: 0 })).toBe(true);
  });

  it("returns false for points beyond tolerance", () => {
    expect(isZeroLengthSegment({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(false);
  });
});
