import { describe, expect, it } from "vitest";
import {
  getNearestPointOnPolyline,
  getPointAtPolylineDistance,
  getPointAtPolylineT,
  getPolylineBoundingBox,
  getPolylineLength,
  getPolylineMidpoints,
  getPolylineSegmentLengths,
  getPolylineVertices,
  getTangentAtPolylineDistance,
  getTangentAtPolylineT,
  isValidPolyline,
  normalizePolylinePoints,
  polylineToSegments,
  transformPolylinePoints
} from "./polyline";
import { rotationMatrix } from "./matrix";

describe("isValidPolyline", () => {
  it("requires two points for an open polyline", () => {
    expect(isValidPolyline([{ x: 0, y: 0 }], false)).toBe(false);
    expect(isValidPolyline([{ x: 0, y: 0 }, { x: 1, y: 0 }], false)).toBe(true);
  });

  it("requires three points for a closed polyline", () => {
    expect(isValidPolyline([{ x: 0, y: 0 }, { x: 1, y: 0 }], true)).toBe(false);
    expect(isValidPolyline([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], true)).toBe(true);
  });

  it("rejects non-finite coordinates", () => {
    expect(isValidPolyline([{ x: 0, y: 0 }, { x: NaN, y: 0 }], false)).toBe(false);
  });
});

describe("normalizePolylinePoints", () => {
  it("removes consecutive duplicates within tolerance", () => {
    const result = normalizePolylinePoints([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5.0000001, y: 0 },
      { x: 10, y: 0 }
    ], 1e-3);

    expect(result).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 }
    ]);
  });

  it("preserves non-consecutive repeats so closed loops keep shape", () => {
    const result = normalizePolylinePoints([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 0, y: 0 }
    ]);

    expect(result.length).toBe(3);
  });
});

describe("polylineToSegments", () => {
  it("expands an open polyline into n-1 segments", () => {
    const segments = polylineToSegments({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 }
      ],
      closed: false
    });

    expect(segments).toHaveLength(2);
    expect(segments[0]?.start).toEqual({ x: 0, y: 0 });
    expect(segments[1]?.end).toEqual({ x: 5, y: 5 });
  });

  it("adds the closing segment when closed = true", () => {
    const segments = polylineToSegments({
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 5, y: 5 }
      ],
      closed: true
    });

    expect(segments).toHaveLength(3);
    expect(segments[2]?.start).toEqual({ x: 5, y: 5 });
    expect(segments[2]?.end).toEqual({ x: 0, y: 0 });
  });
});

describe("getPolylineBoundingBox", () => {
  it("covers all vertices", () => {
    const bbox = getPolylineBoundingBox({
      points: [
        { x: -1, y: -2 },
        { x: 5, y: 3 },
        { x: 2, y: 7 }
      ],
      closed: false
    });

    expect(bbox).toEqual({ minX: -1, minY: -2, maxX: 5, maxY: 7 });
  });
});

describe("getPolylineLength and getPolylineSegmentLengths", () => {
  it("sums segment lengths for an open polyline", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 }
      ],
      closed: false
    };

    expect(getPolylineSegmentLengths(polyline)).toEqual([3, 4]);
    expect(getPolylineLength(polyline)).toBe(7);
  });

  it("includes the closing segment when closed = true", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 3, y: 4 }
      ],
      closed: true
    };

    expect(getPolylineLength(polyline)).toBe(12);
  });
});

describe("getPointAtPolylineT and distance", () => {
  it("samples the midpoint of an L-shaped open polyline", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 6 }
      ],
      closed: false
    };

    const sample = getPointAtPolylineT(polyline, 0.5);

    expect(sample).not.toBeNull();
    expect(sample!.point.x).toBeCloseTo(4);
    expect(sample!.point.y).toBeCloseTo(1);
    expect(sample!.segmentIndex).toBe(1);
  });

  it("samples by absolute distance and clamps when overshooting open polylines", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 }
      ],
      closed: false
    };

    const sample = getPointAtPolylineDistance(polyline, 100);

    expect(sample!.point).toEqual({ x: 5, y: 0 });
  });

  it("wraps distance for closed polylines", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
        { x: 0, y: 4 }
      ],
      closed: true
    };

    const totalLength = getPolylineLength(polyline);
    const sampleA = getPointAtPolylineDistance(polyline, 2);
    const sampleB = getPointAtPolylineDistance(polyline, 2 + totalLength);

    expect(sampleA!.point.x).toBeCloseTo(sampleB!.point.x);
    expect(sampleA!.point.y).toBeCloseTo(sampleB!.point.y);
  });
});

describe("getTangent helpers", () => {
  it("returns the segment unit tangent at the requested distance", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 5 }
      ],
      closed: false
    };

    const tangent = getTangentAtPolylineDistance(polyline, 2);

    expect(tangent!.x).toBeCloseTo(0);
    expect(tangent!.y).toBeCloseTo(1);
  });

  it("returns the same tangent for matching t and distance values", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 6 }
      ],
      closed: false
    };

    const tangentByT = getTangentAtPolylineT(polyline, 0.5);
    const totalLength = getPolylineLength(polyline);
    const tangentByDistance = getTangentAtPolylineDistance(polyline, totalLength * 0.5);

    expect(tangentByT!.x).toBeCloseTo(tangentByDistance!.x);
    expect(tangentByT!.y).toBeCloseTo(tangentByDistance!.y);
  });
});

describe("getNearestPointOnPolyline", () => {
  it("snaps to the closest segment for an L-shape", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 }
      ],
      closed: false
    };

    const nearest = getNearestPointOnPolyline(polyline, { x: 5, y: 1 });

    expect(nearest!.point.x).toBeCloseTo(5);
    expect(nearest!.point.y).toBeCloseTo(0);
    expect(nearest!.segmentIndex).toBe(0);
  });
});

describe("getPolylineMidpoints and getPolylineVertices", () => {
  it("returns midpoints aligned with polylineToSegments", () => {
    const polyline = {
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 }
      ],
      closed: false
    };

    expect(getPolylineMidpoints(polyline)).toEqual([
      { x: 2, y: 0 },
      { x: 4, y: 2 }
    ]);
  });

  it("exposes the original vertices unchanged", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    ];

    expect(getPolylineVertices({ points, closed: false })).toEqual(points);
  });
});

describe("transformPolylinePoints", () => {
  it("applies a rotation to every vertex", () => {
    const points = [
      { x: 1, y: 0 },
      { x: 2, y: 0 }
    ];

    const transformed = transformPolylinePoints(points, rotationMatrix(Math.PI / 2, { x: 0, y: 0 }));

    expect(transformed[0]?.x).toBeCloseTo(0);
    expect(transformed[0]?.y).toBeCloseTo(1);
    expect(transformed[1]?.x).toBeCloseTo(0);
    expect(transformed[1]?.y).toBeCloseTo(2);
  });
});
